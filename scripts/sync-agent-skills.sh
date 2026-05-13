#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_TARGET_DIR="$ROOT_DIR/plugins/surrealdb/skills"
DEFAULT_REPO_URL="https://github.com/surrealdb/agent-skills.git"
DEFAULT_REF="main"
PROTECTED_SKILLS=("mcp")

SOURCE_DIR=""
TARGET_DIR="$DEFAULT_TARGET_DIR"
REPO_URL="$DEFAULT_REPO_URL"
REF="$DEFAULT_REF"
KEEP_TEMP=0

usage() {
	echo "Sync SurrealDB Agent Skills into the Codex plugin."
	echo
	echo "Usage:"
	echo "  scripts/sync-agent-skills.sh [--source /path/to/agent-skills] [--target /path/to/skills]"
	echo "                               [--repo https://github.com/surrealdb/agent-skills.git] [--ref main]"
	echo "                               [--keep-temp]"
	echo
	echo "Options:"
	echo "  --source    Use an existing local checkout instead of cloning."
	echo "  --target    Destination skills directory. Default: $DEFAULT_TARGET_DIR"
	echo "  --repo      Git repository to clone when --source is not provided."
	echo "  --ref       Branch, tag, or commit to clone. Default: $DEFAULT_REF"
	echo "  --keep-temp Leave the temporary clone on disk for inspection."
	echo "  -h, --help  Show this help text."
}

while [ "$#" -gt 0 ]; do
	case "$1" in
		--source)
			SOURCE_DIR="${2:-}"
			shift 2
			;;
		--target)
			TARGET_DIR="${2:-}"
			shift 2
			;;
		--repo)
			REPO_URL="${2:-}"
			shift 2
			;;
		--ref)
			REF="${2:-}"
			shift 2
			;;
		--keep-temp)
			KEEP_TEMP=1
			shift
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			echo "Unknown argument: $1" >&2
			echo >&2
			usage >&2
			exit 1
			;;
	esac
done

is_protected_skill() {
	local skill_name="$1"
	local protected
	for protected in "${PROTECTED_SKILLS[@]}"; do
		if [ "$skill_name" = "$protected" ]; then
			return 0
		fi
	done
	return 1
}

copy_dir_contents() {
	local src_dir="$1"
	local dest_dir="$2"

	mkdir -p "$dest_dir"
	cp -R "$src_dir"/. "$dest_dir"/
}

TEMP_DIR=""
cleanup() {
	if [ -n "$TEMP_DIR" ] && [ "$KEEP_TEMP" -ne 1 ]; then
		rm -rf "$TEMP_DIR"
	fi
}
trap cleanup EXIT

if [ -z "$SOURCE_DIR" ]; then
	TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/surreal-agent-skills.XXXXXX")"
	SOURCE_DIR="$TEMP_DIR/agent-skills"
	echo "Cloning $REPO_URL@$REF into $SOURCE_DIR"
	git clone --depth 1 --branch "$REF" "$REPO_URL" "$SOURCE_DIR"
else
	SOURCE_DIR="$(cd "$SOURCE_DIR" && pwd)"
fi

if [ ! -d "$SOURCE_DIR/skills" ]; then
	echo "Expected skills directory at $SOURCE_DIR/skills" >&2
	exit 1
fi

mkdir -p "$TARGET_DIR"

SYNC_COUNT=0
for skill_dir in "$SOURCE_DIR"/skills/*; do
	if [ ! -d "$skill_dir" ]; then
		continue
	fi

	skill_name="$(basename "$skill_dir")"
	if is_protected_skill "$skill_name"; then
		echo "Skipping protected local skill: $skill_name"
		continue
	fi

	if [ ! -f "$skill_dir/SKILL.md" ]; then
		echo "Skipping $skill_name because SKILL.md is missing"
		continue
	fi

	target_skill_dir="$TARGET_DIR/$skill_name"
	mkdir -p "$target_skill_dir"
	cp "$skill_dir/SKILL.md" "$target_skill_dir/SKILL.md"

	if [ -d "$skill_dir/references" ]; then
		rm -rf "$target_skill_dir/references"
		copy_dir_contents "$skill_dir/references" "$target_skill_dir/references"
	else
		rm -rf "$target_skill_dir/references"
	fi

	rm -f "$target_skill_dir/.sync-source.json"

	echo "Synced $skill_name -> $target_skill_dir"
	SYNC_COUNT=$((SYNC_COUNT + 1))
done

echo "Finished syncing $SYNC_COUNT upstream skill(s) into $TARGET_DIR"
