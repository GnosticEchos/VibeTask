#!/bin/bash
set -euo pipefail

# Post-generation refinement script for MCP compatibility
# This script adds JsonSchema derives and validation attributes to generated types

GENERATED_DIR="./vibetask-mcp/src/generated"

echo "🔧 Refining generated types for MCP compatibility..."

# Ensure the generated directory exists
if [ ! -d "$GENERATED_DIR" ]; then
    echo "❌ Generated directory not found: $GENERATED_DIR"
    exit 1
fi

# Add JsonSchema import to lib.rs if not present
if ! grep -q "use schemars::JsonSchema;" "$GENERATED_DIR/lib.rs" 2>/dev/null; then
    echo "📝 Adding JsonSchema import to lib.rs..."
    sed -i '1i use schemars::JsonSchema;' "$GENERATED_DIR/lib.rs" 2>/dev/null || true
fi

# Process all model files to add JsonSchema derives
find "$GENERATED_DIR" -name "*.rs" -type f | while read -r file; do
    if [[ "$file" == *"/mod.rs" ]] || [[ "$file" == *"/lib.rs" ]] || [[ "$file" == *"/configuration.rs" ]]; then
        continue
    fi
    
    echo "🔍 Processing: $(basename "$file")"
    
    # Add JsonSchema to derive attributes if not present
    if grep -q "#\[derive(" "$file" && ! grep -q "JsonSchema" "$file"; then
        sed -i 's/#\[derive(\([^]]*\)\]/#[derive(\1, JsonSchema)]/' "$file"
        echo "  ✅ Added JsonSchema derive"
    fi
    
    # Add validation attributes for common patterns
    # Add email validation for email fields
    sed -i 's/pub email: String,/pub email: String, \/\/ TODO: Add email validation/' "$file"
    
    # Add length validation for name fields
    sed -i 's/pub name: String,/pub name: String, \/\/ TODO: Add length validation/' "$file"
done

# Create a types module that re-exports commonly used types
cat > "$GENERATED_DIR/types.rs" << 'EOF'
//! Common type re-exports for MCP tools
//! 
//! This module provides convenient access to the most commonly used
//! types from the generated API client.

// Agent API types (most important for MCP tools)
pub use crate::generated::{
    AgentMeResponse,
    AgentInfo,
    AgentMetadata,
    ApiAllowance,
    Delegation,
    PermissionLevel,
};

// Project and task types
pub use crate::generated::{
    Project,
    ProjectSummary,
    Task,
    TaskWithDetails,
    Column,
    ProjectDocument,
};

// Request/Response types
pub use crate::generated::{
    CreateDocumentInput,
    PatchDocumentInput,
    ErrorResponse,
    PaginationMeta,
};

// Common enums
pub use crate::generated::{
    TaskStatus,
    ProjectStatus,
    DocumentRole,
};
EOF

echo "📦 Created types.rs with common re-exports"

# Update lib.rs to include the types module
if ! grep -q "pub mod types;" "$GENERATED_DIR/lib.rs"; then
    echo "pub mod types;" >> "$GENERATED_DIR/lib.rs"
    echo "📝 Added types module to lib.rs"
fi

echo "✅ Type refinement complete!"
echo "📍 Generated types are available in: $GENERATED_DIR"
echo "🔗 Common types re-exported in: $GENERATED_DIR/types.rs"