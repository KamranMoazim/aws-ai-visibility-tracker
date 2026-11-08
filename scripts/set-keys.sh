#!/usr/bin/env bash
set -euo pipefail

# Stores engine API keys as SSM SecureString parameters (no idle cost, unlike Secrets Manager).
REGION="${AWS_REGION:-us-east-1}"

store() {
  local name="$1" label="$2" value
  read -r -s -p "$label (blank to skip): " value
  echo
  if [[ -n "$value" ]]; then
    aws ssm put-parameter --region "$REGION" --name "$name" --type SecureString \
      --value "$value" --overwrite >/dev/null
    echo "stored $name"
  fi
}

store /answershare/openai-api-key "OpenAI API key"
store /answershare/perplexity-api-key "Perplexity API key"
