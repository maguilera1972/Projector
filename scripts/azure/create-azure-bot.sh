#!/usr/bin/env bash
# Crée (ou met à jour) la ressource Azure Bot de PROJECTOR avec Azure CLI et active le canal Teams.
# Idempotent. Variante sans Azure CLI : node scripts/azure/create-azure-bot.mjs (connexion par code).
#
# Usage : bash scripts/azure/create-azure-bot.sh [abonnement] [groupe-de-ressources] [région]
set -euo pipefail

SUBSCRIPTION="${1:-${AZURE_SUBSCRIPTION_ID:-}}"
RESOURCE_GROUP="${2:-rg-projector}"
LOCATION="${3:-switzerlandnorth}"
BOT_NAME="${BOT_NAME:-projector-bot}"
TENANT_ID="c4691421-eeae-4c7e-bd67-17849bca6c78"
APP_ID="f5f1bb90-afec-4e0d-9500-2f6e970ef5a9"
ENDPOINT="https://projector.aguilera.ch/api/teams/messages"

command -v az >/dev/null || { echo "Azure CLI absente : https://aka.ms/installazurecli (ou utilisez create-azure-bot.mjs)." >&2; exit 69; }

if ! az account show >/dev/null 2>&1; then
  az login --tenant "$TENANT_ID" --use-device-code >/dev/null
fi
[[ -n "$SUBSCRIPTION" ]] && az account set --subscription "$SUBSCRIPTION"
echo "Abonnement : $(az account show --query '[name, id]' -o tsv | paste -sd ' ')"

az provider register --namespace Microsoft.BotService --wait >/dev/null
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --tags application=PROJECTOR -o none

if az bot show --resource-group "$RESOURCE_GROUP" --name "$BOT_NAME" >/dev/null 2>&1; then
  az bot update --resource-group "$RESOURCE_GROUP" --name "$BOT_NAME" --endpoint "$ENDPOINT" -o none
else
  az bot create --resource-group "$RESOURCE_GROUP" --name "$BOT_NAME" \
    --app-type SingleTenant --appid "$APP_ID" --tenant-id "$TENANT_ID" \
    --endpoint "$ENDPOINT" --sku F0 --display-name PROJECTOR -o none
fi

az bot msteams show --resource-group "$RESOURCE_GROUP" --name "$BOT_NAME" >/dev/null 2>&1 \
  || az bot msteams create --resource-group "$RESOURCE_GROUP" --name "$BOT_NAME" -o none

az bot show --resource-group "$RESOURCE_GROUP" --name "$BOT_NAME" \
  --query '{id:id, endpoint:properties.endpoint, appType:properties.msaAppType}' -o table
az bot msteams show --resource-group "$RESOURCE_GROUP" --name "$BOT_NAME" \
  --query '{teams:properties.properties.isEnabled}' -o table
