#!/usr/bin/env bash
# Runs on the OVH server. Pulls the newest Claritia images and restarts the containers whose image changed. Docker
# leaves the rest running. It finds the Compose projects from the containers that run these images, so it needs no
# folder names and never edits a file on the server.
# GitHub Actions calls it over SSH on every push to main (.github/workflows/build-images.yml, job
# "deploy"), as "deploy.sh <commit>". By hand, on the server: ./deploy.sh
# The workflow then waits until https://app.tryclaritia.com/api/version shows the new commit, so a deploy that didn't
# happen fails the run.
#
# Setup, once, on the server (README, Deploy):
#   1. Put this file at /docker/claritia-web/deploy.sh (any folder works) and chmod +x it.
#   2. The SSH user needs Docker (the docker group), a ghcr.io login that can pull these images, and read access to
#      the apps' Compose folders, .env included. It never writes them.
#   3. In that user's ~/.ssh/authorized_keys, lock the CI key to this script and nothing else:
#        command="/docker/claritia-web/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... github-deploy
set -euo pipefail

# The images this deploys, by name: any registry, owner or tag.
IMAGES="claritia-web claritia-runner claritia-relay claritia-intel"
# The image that carries the newest copy of this script (Dockerfile copies it to deploy/deploy.sh).
SCRIPT_IMAGE=claritia-web

SELF=$(readlink -f "$0")
[ -n "${DEPLOY_TMP:-}" ] && trap 'rm -f "$DEPLOY_TMP"' EXIT

# The commit GitHub Actions sent (ssh ... deploy.sh <commit>), only to say what this deploy is for.
COMMIT=""
for word in ${SSH_ORIGINAL_COMMAND:-} "$@"; do
  [[ "$word" =~ ^[0-9a-f]{40}$ ]] && COMMIT=$word
done
echo "deploy: ${COMMIT:+commit $COMMIT, }images $IMAGES"

# One line for each container that runs one of IMAGES: image|project|folder|compose files.
containers() {
  local ids image project dir files name want
  ids=$(docker ps -aq)
  [ -n "$ids" ] || return 0
  # shellcheck disable=SC2086
  # A container that goes away meanwhile is left out.
  { docker inspect -f '{{.Config.Image}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.project.working_dir"}}|{{index .Config.Labels "com.docker.compose.project.config_files"}}' $ids 2>/dev/null || true; } |
    while IFS='|' read -r image project dir files; do
      name=${image##*/}
      name=${name%%[:@]*}
      for want in $IMAGES; do
        if [ "$name" = "$want" ]; then printf '%s|%s|%s|%s\n' "$image" "$project" "$dir" "$files"; fi
      done
    done | sort -u
}

# docker compose for one project, with the files it was started with.
compose() {
  local project=$1 dir=$2 files=$3 file args=()
  shift 3
  IFS=, read -r -a list <<< "$files"
  for file in "${list[@]}"; do
    [ -f "$file" ] && args+=(-f "$file")
  done
  (cd "$dir" && docker compose -p "$project" "${args[@]}" "$@")
}

ROWS=$(containers)
if [ -z "$ROWS" ]; then
  echo "deploy: no container on this server runs $IMAGES. Start the apps once by hand first." >&2
  exit 1
fi
PROJECTS=$(printf '%s\n' "$ROWS" | cut -d'|' -f2- | sort -u)
SCRIPT_REF=$(printf '%s\n' "$ROWS" | while IFS='|' read -r image _; do
  name=${image##*/}
  [ "${name%%[:@]*}" = "$SCRIPT_IMAGE" ] && { echo "$image"; break; }
done || true)

each_project() {
  local project dir files
  while IFS='|' read -r project dir files; do
    if [ -z "$project" ] || [ ! -d "$dir" ]; then
      echo "deploy: a container runs one of $IMAGES outside a Compose folder this user can see ($project $dir). Skipping it." >&2
      continue
    fi
    echo "deploy: $1 $project"
    compose "$project" "$dir" "$files" "${@:2}" < /dev/null
  done <<< "$PROJECTS"
}

# Pulled already when an older copy of this script handed over to this one.
if [ -z "${DEPLOY_TMP:-}" ]; then
  each_project pulling pull
fi

# This script keeps itself current: the app's image carries the newest copy. If it differs from this one, run that one
# instead, so a change to the deploy needs nothing done on the server. The copy on disk is replaced too when this user
# may write it.
if [ -z "${DEPLOY_TMP:-}" ] && [ -n "$SCRIPT_REF" ]; then
  NEW=$(mktemp)
  if docker run --rm --entrypoint cat "$SCRIPT_REF" deploy/deploy.sh > "$NEW" 2>/dev/null && head -n 1 "$NEW" | grep -q '^#!' && ! cmp -s "$NEW" "$SELF"; then
    cp "$NEW" "$SELF" 2>/dev/null || true
    echo "deploy: running the newest deploy script"
    DEPLOY_TMP="$NEW" exec bash "$NEW" "$@"
  fi
  rm -f "$NEW"
fi

# Database migrations aren't run here: supabase/migrations files are still run by hand with psql (README, Setup), so
# run a new one before merging code that needs it.
each_project "restarting what changed in" up -d

# Old images pile up with every build. Remove the ones nothing uses.
docker image prune -f >/dev/null || true
echo "deploy: done"
