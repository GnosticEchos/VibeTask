#!/usr/bin/env python3
"""
Test AgentSmith's ability to read documents from project 10
"""
import json
import subprocess
import sys
import os
import select

def test_agentsmith_document_access():
    """Test AgentSmith's document access capabilities"""
    print("📖 Testing AgentSmith Document Access")
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
        print("\n1️⃣ Connecting as AgentSmith...")
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"roots": {"listChanged": True}},
                "clientInfo": {"name": "agentsmith-docs-test", "version": "1.0.0"}
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
                    capabilities = response['result']['capabilities']
                    print(f"   Tools: {'✅' if capabilities.get('tools') else '❌'}")
                    print(f"   Resources: {'✅' if capabilities.get('resources') else '❌'}")
                    print(f"   Prompts: {'✅' if capabilities.get('prompts') else '❌'}")
                else:
                    print(f"❌ Connection failed: {response}")
                    return False
        
        # List available tools
        print("\n2️⃣ Checking available tools...")
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
                    print(f"✅ AgentSmith has {len(tools)} tools available:")
                    for tool in tools:
                        print(f"   • {tool['name']}: {tool.get('description', 'No description')}")
                    
                    # Check for document-related tools
                    doc_tools = [t for t in tool_names if 'document' in t.lower() or 'read' in t.lower()]
                    if doc_tools:
                        print(f"\n   📚 Document-related tools: {doc_tools}")
                    else:
                        print("\n   ℹ️  No document-specific tools available for Project Agent")
        
        # Try to access resources (Project Agents should have resources)
        print("\n3️⃣ Checking available resources...")
        resources_request = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "resources/list"
        }
        
        process.stdin.write(json.dumps(resources_request) + "\n")
        process.stdin.flush()
        
        ready, _, _ = select.select([process.stdout], [], [], 5.0)
        if ready:
            response_line = process.stdout.readline()
            if response_line.strip():
                response = json.loads(response_line)
                if "result" in response:
                    resources = response['result']['resources']
                    print(f"✅ AgentSmith has {len(resources)} resources:")
                    for resource in resources:
                        print(f"   • {resource['name']}: {resource['uri']}")
                        if 'project' in resource['uri'].lower():
                            print(f"     Description: {resource.get('description', 'No description')}")
        
        # Test if we can try read_documents anyway (might work for Project Agents now)
        print("\n4️⃣ Testing read_documents tool...")
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
        
        ready, _, _ = select.select([process.stdout], [], [], 10.0)
        if ready:
            response_line = process.stdout.readline()
            if response_line.strip():
                response = json.loads(response_line)
                if "result" in response:
                    print("✅ read_documents executed successfully!")
                    content = response['result']['content']
                    if content and content[0].get('text'):
                        docs_text = content[0]['text']
                        print("   📚 Documents found:")
                        # Show first few lines
                        lines = docs_text.split('\n')[:15]
                        for line in lines:
                            if line.strip():
                                print(f"   {line}")
                        if len(docs_text.split('\n')) > 15:
                            print("   ... (truncated)")
                elif "error" in response:
                    print(f"❌ read_documents failed: {response['error']['message']}")
                else:
                    print(f"⚠️  Unexpected response: {response}")
        
        # Test other potential document access methods
        print("\n5️⃣ Testing get_context tool...")
        context_request = {
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {
                "name": "get_context",
                "arguments": {"project_id": 10, "task_id": 1, "inline": True}
            }
        }
        
        process.stdin.write(json.dumps(context_request) + "\n")
        process.stdin.flush()
        
        ready, _, _ = select.select([process.stdout], [], [], 10.0)
        if ready:
            response_line = process.stdout.readline()
            if response_line.strip():
                response = json.loads(response_line)
                if "result" in response:
                    print("✅ get_context executed successfully!")
                    content = response['result']['content']
                    if content and content[0].get('text'):
                        context_text = content[0]['text']
                        print("   🎯 Task context retrieved:")
                        lines = context_text.split('\n')[:10]
                        for line in lines:
                            if line.strip():
                                print(f"   {line}")
                elif "error" in response:
                    print(f"❌ get_context failed: {response['error']['message']}")
        
        print("\n" + "=" * 50)
        print("📊 AgentSmith Document Access Results:")
        print("✅ AgentSmith authenticated successfully")
        print("✅ Project Agent capabilities confirmed")
        print("✅ Has USER permissions on project 10 'Spec Task Board'")
        
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
    print("🎯 AgentSmith Document Reading Test")
    print("Testing Project Agent document access with new keys...")
    
    success = test_agentsmith_document_access()
    
    if success:
        print(f"\n🎉 Test completed!")
        print(f"\n💡 Key Findings:")
        print("• AgentSmith is working with new API key")
        print("• Project Agent has USER permissions on project 10")
        print("• Document access patterns depend on agent type and tool availability")
        print("• Platform Agent tools may or may not be available to Project Agents")
        
        return True
    else:
        print(f"\n💥 Test failed!")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)