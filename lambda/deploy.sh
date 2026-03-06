#!/bin/bash
# ============================================================
# Deploy Dynamic Executor Lambda Function
# ============================================================
#
# Prerequisites:
#   - AWS CLI installed and configured (aws configure)
#   - IAM role with basic Lambda execution permissions
#   - pip installed
#
# IAM Role Setup (one-time):
#   1. Go to IAM Console → Roles → Create Role
#   2. Trusted entity: AWS service → Lambda
#   3. Attach policy: AWSLambdaBasicExecutionRole
#   4. Name: workflow-dynamic-executor-role
#   5. Copy the Role ARN and set it below
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Environment Variables (optional overrides):
#   LAMBDA_ROLE_ARN    - IAM role ARN for the Lambda function
#   AWS_REGION         - AWS region (default: ap-south-1)
#   FUNCTION_NAME      - Lambda function name (default: workflow-dynamic-executor)
# ============================================================

set -e

# Configuration
FUNCTION_NAME="${FUNCTION_NAME:-workflow-dynamic-executor}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
RUNTIME="python3.11"
TIMEOUT=10
MEMORY=256
HANDLER="dynamic_executor.lambda_handler"

# IAM Role ARN — replace with your actual role ARN
LAMBDA_ROLE_ARN="${LAMBDA_ROLE_ARN:-arn:aws:iam::YOUR_ACCOUNT_ID:role/workflow-dynamic-executor-role}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Deploying: ${FUNCTION_NAME}${NC}"
echo -e "${GREEN}  Region:    ${AWS_REGION}${NC}"
echo -e "${GREEN}  Runtime:   ${RUNTIME}${NC}"
echo -e "${GREEN}  Timeout:   ${TIMEOUT}s | Memory: ${MEMORY}MB${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Validate role ARN
if [[ "$LAMBDA_ROLE_ARN" == *"YOUR_ACCOUNT_ID"* ]]; then
    echo -e "${RED}ERROR: Please set LAMBDA_ROLE_ARN with your actual IAM role ARN${NC}"
    echo "  export LAMBDA_ROLE_ARN=arn:aws:iam::123456789012:role/workflow-dynamic-executor-role"
    exit 1
fi

# Create temp build directory
BUILD_DIR=$(mktemp -d)
echo -e "${YELLOW}📦 Building deployment package in ${BUILD_DIR}${NC}"

# Copy Lambda function
cp dynamic_executor.py "$BUILD_DIR/"

# Install dependencies into the build directory
echo -e "${YELLOW}📥 Installing dependencies...${NC}"
pip install requests beautifulsoup4 -t "$BUILD_DIR/" --quiet --no-cache-dir

# Create ZIP
cd "$BUILD_DIR"
ZIP_FILE="/tmp/${FUNCTION_NAME}.zip"
zip -r9 "$ZIP_FILE" . > /dev/null
echo -e "${GREEN}✅ Package created: $(du -h "$ZIP_FILE" | cut -f1)${NC}"

# Check if function exists
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$AWS_REGION" > /dev/null 2>&1; then
    # Update existing function
    echo -e "${YELLOW}🔄 Updating existing Lambda function...${NC}"
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file "fileb://${ZIP_FILE}" \
        --region "$AWS_REGION" \
        --no-cli-pager

    # Update configuration
    aws lambda update-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --timeout "$TIMEOUT" \
        --memory-size "$MEMORY" \
        --runtime "$RUNTIME" \
        --region "$AWS_REGION" \
        --no-cli-pager
else
    # Create new function
    echo -e "${YELLOW}🆕 Creating new Lambda function...${NC}"
    aws lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --runtime "$RUNTIME" \
        --handler "$HANDLER" \
        --role "$LAMBDA_ROLE_ARN" \
        --zip-file "fileb://${ZIP_FILE}" \
        --timeout "$TIMEOUT" \
        --memory-size "$MEMORY" \
        --region "$AWS_REGION" \
        --no-cli-pager
fi

# Cleanup
rm -rf "$BUILD_DIR" "$ZIP_FILE"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ Deployment complete!${NC}"
echo -e "${GREEN}  Function: ${FUNCTION_NAME}${NC}"
echo -e "${GREEN}  Region:   ${AWS_REGION}${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Test with:"
echo "  aws lambda invoke --function-name ${FUNCTION_NAME} --region ${AWS_REGION} \\"
echo "    --payload '{\"generated_code\": \"def run(inputs, context):\\n    return {\\\"hello\\\": inputs.get(\\\"name\\\", \\\"world\\\")}\", \"inputs\": {\"name\": \"test\"}, \"context\": {}}' \\"
echo "    /tmp/lambda-response.json && cat /tmp/lambda-response.json"
