#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
REGION="${AWS_REGION:-us-east-1}"

read -r -p "Delete the AnswerShare stack, its data and stored API keys in $REGION? Type yes: " answer
if [[ "$answer" != "yes" ]]; then
  echo "cancelled"
  exit 1
fi

npm --prefix infra run destroy

for name in /answershare/openai-api-key /answershare/perplexity-api-key /answershare/wordpress-app-password; do
  aws ssm delete-parameter --region "$REGION" --name "$name" >/dev/null 2>&1 && echo "deleted $name" || true
done

# CDK-managed custom resources can leave log groups behind after the stack is gone.
for prefix in /aws/lambda/AnswerShareStack- AnswerShareStack-; do
  for group in $(aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "$prefix" \
    --query 'logGroups[].logGroupName' --output text); do
    aws logs delete-log-group --region "$REGION" --log-group-name "$group" && echo "deleted $group"
  done
done

rm -f infra/cdk-outputs.json client/public/config.json
echo "teardown complete"
