#!/usr/bin/env bash
set -euo pipefail

# Stores engine API keys as SSM SecureString parameters (no idle cost, unlike Secrets Manager).
REGION="${AWS_REGION:-us-east-1}"

store() {
  local name="$1" label="$2" variable="$3" value="${!3:-}"
  if [[ -z "$value" ]]; then
    if [[ ! -t 0 ]]; then
      echo "skip $name: no terminal to prompt on and $variable is not set"
      return
    fi
    read -r -s -p "$label (blank to skip): " value
    echo
  fi
  if [[ -n "$value" ]]; then
    aws ssm put-parameter --region "$REGION" --name "$name" --type SecureString \
      --value "$value" --overwrite >/dev/null
    echo "stored $name"
  else
    echo "skipped $name"
  fi
}

store /answershare/openai-api-key "OpenAI API key" OPENAI_API_KEY
store /answershare/perplexity-api-key "Perplexity API key" PERPLEXITY_API_KEY
store /answershare/wordpress-app-password "WordPress application password" WORDPRESS_APP_PASSWORD
