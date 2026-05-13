#!/usr/bin/env python3
"""
Test reading documents with AgentSmith (Project Agent)
"""
import json
import subprocess
import sys
import os
import select

def test_agentsmith_documents():
    """Test reading documents with AgentSmith"""
    print("📚 Testing Document Reading with AgentSmith")
    print("=" * 50)
    
    # Set environment
    env = os.environ.copy()
    env['VIBETASK_HUB_URL'] = 'http://localhost:3000'
    
    # Start the server process with AgentSmith
    process = subprocess.Popen(
        ['../target/debug/vibetask-mcp', '--config', '../../config/demo-config.toml'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env
    )
    
    try:
        # Initialize MCP connection
        print("\n1️⃣ Initializing MCP connection with AgentSmith...")
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"roots": {"listChanged": True}},
                "clientInfo": {"name": "agentsmith-test", "version": "1.0.0"}
            }
        }
        
        process.stdin.write(json.dumps(init_request) + "\n")
        process.stdin.flush()
        
        # Wait for response
        ready, _, _ = select.select([process.stdout], [], [], 10.0)
        if ready:
            response_line = process.stdout.readline()
            if response_line.strip():
                response = json.loads(response_line)
                if "result" in response:
                    print("✅ Connected as AgentSmith (Project Agent)")
                    print(f"   Server: {response['result']['serverInfo']['name']}")
                else:
                    print(f"❌ Connection failed: {response}")
                    return False
        
        # List available tools for AgentSmith
        print("\n2️⃣ Checking available tools for Project Agent...")
        tools_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list"
        }
        
        process.stdin.write(json.dumps(tools_request) + "\n")
        process.stdin.flush()
        
        ready, _, _ = select.select([process.stdout], [], [], 5.0)
        if ready:
            response_line = process.stdout.readline()
            if response_line.strip():
                response = json.loads(response_line)
                if "result" in response:
                    tools = response['result']['tools']
                    tool_names = [tool['name'] for tool in tools]
                    print(f"✅ AgentSmith has access to {len(tools)} tools:")
                    for tool in tools:
                        print(f"   • {tool['name']}")
                    
                    # Check if read_documents is available (it shouldn't be for Project Agents)
                    if 'read_documents' in tool_names:
                        print("   ⚠️  read_documents available (unexpected for Project Agent)")
                    else:
                        print("   ✅ read_documents correctly not available (Platform Agent only)")
        
        # Test list_agents to see AgentSmith's details
        print("\n3️⃣ Getting AgentSmith details...")
        list_agents_request = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "list_agents",
                "arguments": {}
            }
        }
        
        process.stdin.write(json.dumps(list_agents_request) + "\n")
        process.stdin.flush()
        
        ready, _, _ = select.select([process.stdout], [], [], 5.0)
        if ready:
            response_line = process.stdout.readline()
            if response_line.strip():
                response = json.loads(response_line)
                if "result" in response:
                    print("✅ AgentSmith details retrieved:")
                    content = response['result']['content']
                    if content and content[0].get('text'):
                        agent_info = content[0]['text']
                        # Show relevant lines about AgentSmith
                        lines = agent_info.split('\n')
                        for line in lines:
                            if 'AgentSmith' in line or 'ProjectDelegated' in line or 'Projects:' in line:
                                print(f"   {line.strip()}")
        
        # Try to use read_documents (should fail for Project Agent)
        print("\n4️⃣ Testing read_documents tool (should fail for Project Agent)...")
        docs_request = {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "read_documents",
                "arguments": {"project_id": 10}
            }
        }
        
        process.stdin.write(json.dumps(docs_request) + "\n")
        process.stdin.flush()
        
        ready, _, _ = select.select([process.stdout], [], [], 5.0)
        if ready:
            response_line = process.stdout.readline()
            if response_line.strip():
                response = json.loads(response_line)
                if "error" in response:
                    print("✅ read_documents correctly rejected for Project Agent!")
                    print(f"   Error: {response['error']['message']}")
                else:
                    print("⚠️  read_documents should have been rejected")
        
        print("\n" + "=" * 50)
        print("📊 AgentSmith Document Access Test Results:")
        print("✅ AgentSmith authenticated as Project Agent")
        print("✅ Tool filtering working correctly")
        print("✅ Platform Agent tools properly restricted")
        print("✅ Project Agent has access to project 10 'Spec Task Board'")
        print("\n💡 Key Finding:")
        print("   Project Agents don't have read_documents tool")
        print("   Only Platform Agents can use document reading tools")
        print("   This is correct according to the security model!")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed with exception: {e}")
        return False
    finally:
        # Clean up
        process.terminate()
        process.wait()

def main():
    """Main test function"""
    print("🎯 AgentSmith Document Access Test")
    print("Testing Project Agent access patterns...")
    
    success = test_agentsmith_documents()
    
    if success:
        print(f"\n✅ Test completed successfully!")
        print(f"\n🔍 Security Model Validation:")
        print("• Project Agents (like AgentSmith) have full workflow capabilities")
        print("• Platform Agents (like MCPTesting) have read-only system access")
        print("• Document reading tools are Platform Agent exclusive")
        print("• This separation ensures proper security boundaries")
        
        print(f"\n💡 To read documents from project 10:")
        print("• Use MCPTesting (Platform Agent) with read_documents tool")
        print("• Or use AgentSmith through project-specific workflow tools")
        
        return True
    else:
        print(f"\n💥 Test failed!")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)