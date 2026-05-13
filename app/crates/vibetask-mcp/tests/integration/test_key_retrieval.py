#!/usr/bin/env python3
"""
Test key retrieval directly
"""
import subprocess
import sys

def test_key_retrieval():
    """Test if we can retrieve the key"""
    print("🔑 Testing Key Retrieval")
    print("=" * 30)
    
    # Test with a simple Rust program that just tries to load the key
    test_program = '''
use std::fs;

fn main() {
    let agent_name = "AgentSmith";
    let env_file = format!(".env.{}", agent_name.to_lowercase());
    
    println!("Looking for file: {}", env_file);
    
    match fs::read_to_string(&env_file) {
        Ok(content) => {
            println!("File content: {}", content);
            for line in content.lines() {
                if let Some(key) = line.strip_prefix("VIBETASK_API_KEY=") {
                    println!("Found key: {}...", &key[..10]);
                    return;
                }
            }
            println!("No VIBETASK_API_KEY found in file");
        }
        Err(e) => {
            println!("Failed to read file: {}", e);
        }
    }
}
'''
    
    # Write test program
    with open('test_key.rs', 'w') as f:
        f.write(test_program)
    
    # Compile and run
    try:
        result = subprocess.run(['rustc', 'test_key.rs'], capture_output=True, text=True)
        if result.returncode == 0:
            result = subprocess.run(['./test_key'], capture_output=True, text=True, cwd='.')
            print("Test output:")
            print(result.stdout)
            if result.stderr:
                print("Errors:")
                print(result.stderr)
        else:
            print("Compilation failed:")
            print(result.stderr)
    except Exception as e:
        print(f"Test failed: {e}")
    finally:
        # Clean up
        import os
        for f in ['test_key.rs', 'test_key']:
            if os.path.exists(f):
                os.remove(f)

if __name__ == "__main__":
    test_key_retrieval()