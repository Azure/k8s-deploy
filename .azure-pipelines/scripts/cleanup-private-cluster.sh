#!/usr/bin/env bash
set -euo pipefail

: "${RESOURCE_GROUP:?RESOURCE_GROUP must be set}"
: "${CLUSTER_NAME:?CLUSTER_NAME must be set}"

# A successful empty listing means absence; lookup errors must remain failures.
existing_cluster=$(az aks list --resource-group "$RESOURCE_GROUP" \
   --query "[?name=='${CLUSTER_NAME}'].name" --output tsv)

if [[ -z "$existing_cluster" ]]; then
   echo "AKS cluster $CLUSTER_NAME was not created; nothing to delete"
   exit 0
fi

echo "deleting AKS cluster $CLUSTER_NAME"
az aks delete --yes --resource-group "$RESOURCE_GROUP" --name "$CLUSTER_NAME"
