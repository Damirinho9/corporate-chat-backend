#!/bin/bash
#
# Quick Support System Test with Sample Data
# Seeds KB articles and runs tests
#

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Quick Support System Test (with sample data)${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if postgres is available
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  psql not found, skipping database seed${NC}"
    SKIP_SEED=true
fi

# Seed database with sample KB articles
if [ "$SKIP_SEED" != "true" ]; then
    echo -e "${BLUE}📚 Seeding Knowledge Base with sample articles...${NC}"

    # Try default port first
    if psql -U postgres -d corporate_chat -p 5432 -f scripts/seed-support-kb.sql 2>/dev/null; then
        echo -e "${GREEN}✅ KB articles seeded (port 5432)${NC}"
    # Try alternative port
    elif psql -U postgres -d corporate_chat -p 5433 -f scripts/seed-support-kb.sql 2>/dev/null; then
        echo -e "${GREEN}✅ KB articles seeded (port 5433)${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not seed database${NC}"
        echo -e "${YELLOW}   Run manually:${NC}"
        echo -e "${YELLOW}   psql -U postgres -d corporate_chat -p 5433 -f scripts/seed-support-kb.sql${NC}"
    fi
    echo ""
fi

# Run tests
echo -e "${BLUE}🧪 Running tests...${NC}"
echo ""

npm test

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}💡 Tip:${NC} To run tests without seeding:"
echo -e "   npm test"
echo ""
