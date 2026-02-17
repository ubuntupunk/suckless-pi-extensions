#!/usr/bin/env bash
# Strip unwanted Co-authored-by lines from commit messages

COMMIT_MSG_FILE="$1"

# Remove the unwanted Co-authored-by line
sed -i '/Co-authored-by: Qwen-Coder <qwen-coder@alibabacloud\.com>/d' "$COMMIT_MSG_FILE"

# You can add more patterns here if needed
# sed -i '/Co-authored-by: Another-Agent <agent@example\.com>/d' "$COMMIT_MSG_FILE"
