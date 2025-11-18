#!/bin/bash
#
# Support System Test Runner
# Runs all automated tests for the support system
#

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Support System Automated Test Suite                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if server is running
echo -e "${BLUE}🔍 Checking if server is running...${NC}"
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server is running${NC}"
else
    echo -e "${RED}❌ Server is not running!${NC}"
    echo -e "${YELLOW}   Please start the server first:${NC}"
    echo -e "${YELLOW}   npm start or pm2 start corporate-chat${NC}"
    exit 1
fi

echo ""

# Set test environment variables
export API_URL=${API_URL:-"http://localhost:3000"}
export TEST_USER_EMAIL=${TEST_USER_EMAIL:-"test@example.com"}
export TEST_USER_PASSWORD=${TEST_USER_PASSWORD:-"test123"}

echo -e "${BLUE}📋 Test Configuration:${NC}"
echo -e "   API URL: ${API_URL}"
echo -e "   Test User: ${TEST_USER_EMAIL}"
echo ""

# Run API tests
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🧪 Running API Tests${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

if node --test tests/support/api.test.js 2>&1 | tee /tmp/api-test-output.log; then
    echo -e "${GREEN}✅ API Tests Passed${NC}"
    API_TESTS_PASSED=true
else
    echo -e "${RED}❌ API Tests Failed${NC}"
    API_TESTS_PASSED=false
fi

echo ""
echo ""

# Run workflow tests
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🔄 Running Workflow Integration Tests${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

if node --test tests/support/workflow.test.js 2>&1 | tee /tmp/workflow-test-output.log; then
    echo -e "${GREEN}✅ Workflow Tests Passed${NC}"
    WORKFLOW_TESTS_PASSED=true
else
    echo -e "${RED}❌ Workflow Tests Failed${NC}"
    WORKFLOW_TESTS_PASSED=false
fi

echo ""
echo ""

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📊 Test Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$API_TESTS_PASSED" = true ] && [ "$WORKFLOW_TESTS_PASSED" = true ]; then
    echo -e "${GREEN}✅ All Tests Passed!${NC}"
    echo ""
    echo -e "${GREEN}🎉 Support system is working correctly${NC}"
    EXIT_CODE=0
else
    echo -e "${RED}❌ Some Tests Failed${NC}"
    echo ""
    echo -e "Results:"
    if [ "$API_TESTS_PASSED" = true ]; then
        echo -e "  ${GREEN}✅ API Tests${NC}"
    else
        echo -e "  ${RED}❌ API Tests${NC}"
    fi

    if [ "$WORKFLOW_TESTS_PASSED" = true ]; then
        echo -e "  ${GREEN}✅ Workflow Tests${NC}"
    else
        echo -e "  ${RED}❌ Workflow Tests${NC}"
    fi

    EXIT_CODE=1
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}💡 Tip: View detailed logs at:${NC}"
echo -e "   /tmp/api-test-output.log"
echo -e "   /tmp/workflow-test-output.log"
echo ""

exit $EXIT_CODE
