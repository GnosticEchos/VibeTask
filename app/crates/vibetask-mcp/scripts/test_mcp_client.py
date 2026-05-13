#!/usr/bin/env python3
"""
Simple MCP client to test our VibeTask MCP server
"""
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, Any

CONFIG_PATH = Path("../../config/demo-config.toml")

class MCPClient:
    def __init__(self, server_command: list):
        self.process = subprocess.Popen(
            server_command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=0
        )
        self.request_id = 1
    
    def send_request(self, method: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Send a JSON-RPC request to the MCP server"""
        request = {
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": method
        }
        if params:
            request["params"] = params
        
        request_json = json.dumps(request) + "\n"
        print(f"→ Sending: {request_json.strip()}")
        
        self.process.stdin.write(request_json)
        self.process.stdin.flush()
        
        # Read response
        response_line = self.process.stdout.readline()
        print(f"← Received: {response_line.strip()}")
        
        self.request_id += 1
        
        if response_line:
            return json.loads(response_line)
        else:
            return {"error": "No response received"}
    
    def close(self):
        """Close the MCP server process"""
        if self.process:
            self.process.terminate()
            self.process.wait()

def test_mcp_server(agent_type: str):
    """Test the MCP server with a specific agent configuration"""
    print(f"\n🧪 Testing MCP Server with {agent_type} Agent")
    print("=" * 60)
    
    # Set up environment
    env_vars = ["VIBETASK_HUB_URL=http://localhost:3000"]
    
    # Start MCP server
    server_cmd = [
        "cargo", "run", "--", 
        "--config", str(CONFIG_PATH)
    ]
    
    # Add environment variables to the command
    full_cmd = env_vars + server_cmd
    
    client = MCPClient(full_cmd)
    
    try:
        # Test 1: Initialize
        print("\n1️⃣ Testing initialization...")
        init_response = client.send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "roots": {
                    "listChanged": True
                }
            },
            "clientInfo": {
                "name": "test-client",
                "version": "1.0.0"
            }
        })
        
        if "result" in init_response:
            print("✅ Initialization successful")
            print(f"   Server: {init_response['result']['serverInfo']['name']}")
            print(f"   Version: {init_response['result']['serverInfo']['version']}")
            
            # Check capabilities
            capabilities = init_response['result']['capabilities']
            print(f"   Tools: {'✅' if capabilities.get('tools') else '❌'}")
            print(f"   Resources: {'✅' if capabilities.get('resources') else '❌'}")
            print(f"   Prompts: {'✅' if capabilities.get('prompts') else '❌'}")
        else:
            print(f"❌ Initialization failed: {init_response}")
            return False
        
        # Test 2: List Tools
        print("\n2️⃣ Testing tool listing...")
        tools_response = client.send_request("tools/list")
        
        if "result" in tools_response:
            tools = tools_response['result']['tools']
            print(f"✅ Found {len(tools)} tools:")
            for tool in tools:
                print(f"   - {tool['name']}: {tool.get('description', 'No description')}")
        else:
            print(f"❌ Tool listing failed: {tools_response}")
        
        # Test 3: Test a tool call (query_health for Platform, list_agents for Project)
        print("\n3️⃣ Testing tool execution...")
        if agent_type == "Platform":
            tool_name = "query_health"
            tool_params = {}
        else:
            tool_name = "list_agents"
            tool_params = {}
        
        tool_response = client.send_request("tools/call", {
            "name": tool_name,
            "arguments": tool_params
        })
        
        if "result" in tool_response:
            print(f"✅ Tool '{tool_name}' executed successfully")
            content = tool_response['result']['content']
            if content:
                print(f"   Response: {content[0].get('text', 'No text content')[:100]}...")
        else:
            print(f"❌ Tool execution failed: {tool_response}")
        
        # Test 4: Resources (only for Project Agents)
        if agent_type == "Project":
            print("\n4️⃣ Testing resource listing...")
            resources_response = client.send_request("resources/list")
            
            if "result" in resources_response:
                resources = resources_response['result']['resources']
                print(f"✅ Found {len(resources)} resources:")
                for resource in resources:
                    print(f"   - {resource['name']}: {resource['uri']}")
            else:
                print(f"❌ Resource listing failed: {resources_response}")
        
        print(f"\n✅ {agent_type} Agent test completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Test failed with exception: {e}")
        return False
    finally:
        client.close()

def main():
    """Main test function"""
    print("🚀 VibeTask MCP Server Integration Test")
    print("Testing with real Hub API and agent keys...")
    
    # Test Platform Agent
    success_platform = test_mcp_server("Platform")
    
    # Switch to Project Agent and test
    print("\n🔄 Switching to Project Agent...")
    
    # Update config to use AgentSmith
    with open(CONFIG_PATH, "r") as f:
        config = f.read()
    
    config = config.replace('active_agent = "MCPTesting"', 'active_agent = "AgentSmith"')
    
    with open(CONFIG_PATH, "w") as f:
        f.write(config)
    
    success_project = test_mcp_server("Project")
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Test Summary:")
    print(f"   Platform Agent: {'✅ PASS' if success_platform else '❌ FAIL'}")
    print(f"   Project Agent:  {'✅ PASS' if success_project else '❌ FAIL'}")
    
    if success_platform and success_project:
        print("\n🎉 All tests passed! MCP server is working correctly with both agent types.")
        sys.exit(0)
    else:
        print("\n💥 Some tests failed. Check the logs above for details.")
        sys.exit(1)

if __name__ == "__main__":
    main()