#!/usr/bin/env bash
# Check script for corporate-chat-backend
set -e

echo "🔍 Running checks for corporate-chat-backend..."

# Run tests
echo "📝 Running tests..."
npm test

echo "✅ All checks passed!"
