#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
OUTPUTS=infra/cdk-outputs.json
REGION=$(node -e "console.log(require('./$OUTPUTS').AnswerShareStack.Region)")
DLQ_URL=$(node -e "console.log(require('./$OUTPUTS').AnswerShareStack.GapDlqUrl)")
DLQ_ARN=$(aws sqs get-queue-attributes --region "$REGION" --queue-url "$DLQ_URL" \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)
WAITING=$(aws sqs get-queue-attributes --region "$REGION" --queue-url "$DLQ_URL" \
  --attribute-names ApproximateNumberOfMessages --query 'Attributes.ApproximateNumberOfMessages' --output text)

echo "$WAITING job(s) in the gap DLQ"
if [[ "$WAITING" == "0" ]]; then
  exit 0
fi
aws sqs start-message-move-task --region "$REGION" --source-arn "$DLQ_ARN" >/dev/null
echo "moving them back to the gap queue; check the worker logs if they fail again"
