#!/usr/bin/env python3
"""
Test the register_agent tool with real API keys
"""
import json
import subprocess
import sys
import os
import time

def test_register_agent():
    """Test registering agents with real API keys"""
    print("🔑 Testing Agent Registration with Real Keys")
    print("=" * 50)
    
    # Create a minimal config for testing
    test_config = """[server]
name = "Test Registration Server"
version = "1.0.0"
active_agent = "placeholder"

[[agents]]
name = "placeholder"
type = "Platform"
key_hash = "sha256:placeholder"
"""
    
    with open('test-registration-config.toml', 'w') as f:
        f.write(test_config)
    
    # Set environment
    env = os.environ.copy()
    env['VIBETASK_HUB_URL'] = 'https://api.vibetask.com'
    
    # Start the server process
    process = subprocess.Popen(
        ['../target/release/vibetask-mcp', '--config', 'test-registration-config.toml'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env
    )
    
    try:
        # Initialize MCP connection
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"roots": {"listChanged": True}},
                "clientInfo": {"name": "test-client", "version": "1.0.0"}
            }
        }
        
        print("1️⃣ Initializing MCP connection...")
        process.stdin.write(json.dumps(init_request) + "\n")
        process.stdin.flush()
        
        # Read initialization response
        response_line = process.stdout.readline()
        if response_line.strip():
            try:
                response = json.loads(response_line)
                if "result" in response:
                    print("✅ MCP connection established")
                else:
                    print(f"❌ MCP initialization failed: {response}")
                    return False
            except json.JSONDecodeError:
                print(f"❌ Invalid response: {response_line}")
                return False
        
        # Test registering Platform Agent (MCPTesting)
        print("\n2️⃣ Registering Platform Agent (MCPTesting)...")
        register_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "register_agent",
                "arguments": {
                    "api_key": "agaPeYbFVGMFUNjpsFserUkydARhLbPDBwRSyENlpyLcbzHhVNkPgwzvasFWeMxEKW",
                    "set_as_active": True
                }
            }
        }
        
        process.stdin.write(json.dumps(register_request) + "\n")
        process.stdin.flush()
        
        # Read registration response
        response_line = process.stdout.readline()
        if response_line.strip():
            try:
                response = json.loads(response_line)
                if "result" in response:
                    print("✅ Platform Agent registered successfully!")
                    content = response['result']['content']
                    if content and content[0].get('text'):
                        print(f"Response: {content[0]['text'][:200]}...")
                else:
                    print(f"❌ Registration failed: {response}")
                    return False
            except json.JSONDecodeError:
                print(f"❌ Invalid response: {response_line}")
                return False
        
        # Test registering Project Agent (AgentSmith)
        print("\n3️⃣ Registering Project Agent (AgentSmith)...")
        register_request = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "register_agent",
                "arguments": {
                    "api_key": "agfgYuouWAFuQJyCmaabQgUFswyagnlrWfrAchDUGhdhJGoruQYriTwdzhAeGDiUrsMC",
                    "set_as_active": False
                }
            }
        }
        
        process.stdin.write(json.dumps(register_request) + "\n")
        process.stdin.flush()
        
        # Read registration response
        response_line = process.stdout.readline()
        if response_line.strip():
            try:
                response = json.loads(response_line)
                if "result" in response:
                    print("✅ Project Agent registered successfully!")
                    content = response['result']['content']
                    if content and content[0].get('text'):
                        print(f"Response: {content[0]['text'][:200]}...")
                else:
                    print(f"❌ Registration failed: {response}")
                    return False
            except json.JSONDecodeError:
                print(f"❌ Invalid response: {response_line}")
                return False
        
        print("\n✅ Both agents registered successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False
    finally:
        # Clean up
        process.terminate()
        process.wait()

def main():
    """Main test function"""
    print("🚀 VibeTask MCP Agent Registration Test")
    
    success = test_register_agent()
    
    if success:
        print("\n🎉 Agent registration successful!")
        print("Now you can test the Platform Agent tools with:")
        print("  ../target/release/vibetask-mcp health --config test-registration-config.toml")
        
        # Clean up
        if os.path.exists('test-registration-config.toml'):
            os.remove('test-registration-config.toml')
        
        return True
    else:
        print("\n💥 Agent registration failed!")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)