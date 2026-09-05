#!/usr/bin/env bash
#
# The one command. Builds index.html and proves it works.
#
#   ./build.sh              test, build, verify
#   ./build.sh --svg        also export one standalone .svg per sheet, to out/
#   ./build.sh --standalone also build the prompt-with-renderer variant, to out/
#
set -uo pipefail
cd "$(dirname "$0")"

RED=$'\033[31m'; GRN=$'\033[32m'; DIM=$'\033[2m'; OFF=$'\033[0m'
fails=0
pass() { printf '%s  ok  %s%s\n' "$GRN" "$OFF" "$1"; }
fail() { printf '%s FAIL %s%s\n' "$RED" "$OFF" "$1"; fails=$((fails+1)); }
step() { printf '\n%s── %s ──%s\n' "$DIM" "$1" "$OFF"; }

want_svg=0; want_standalone=0
for arg in "$@"; do
  case "$arg" in
    --svg) want_svg=1 ;;
    --standalone) want_standalone=1 ;;
    *) printf 'unknown option: %s\n' "$arg"; exit 2 ;;
  esac
done

step "tests"
if out=$(node src/test.mjs 2>&1); then pass "$(printf '%s' "$out" | tail -1)"
else fail "unit and geometry tests"; printf '%s\n' "$out" | sed 's/^/      /'; fi

step "examples validate"
shopt -s nullglob
examples=(src/examples/*.wfd.json)
[ ${#examples[@]} -eq 0 ] && fail "no examples found"
for f in "${examples[@]}"; do
  if out=$(node src/build/render.mjs "$f" --check 2>&1); then
    pass "$(basename "$f")  ${DIM}${out##*$'\n'}${OFF}"
  else
    fail "$(basename "$f")"; printf '%s\n' "$out" | sed 's/^/      /'
  fi
done

step "build"
if out=$(node src/build/library.mjs 2>&1); then
  pass "index.html  ${DIM}$(printf '%s\n' "$out" | tail -1 | sed 's/^ *//')${OFF}"
else
  fail "index.html"; printf '%s\n' "$out" | sed 's/^/      /'
fi

step "the file stands alone"
if [ -f index.html ]; then
  ext=$(grep -cE '<(script|link|img)[^>]+(src|href)="(https?:)?//' index.html || true)
  if [ "$ext" -eq 0 ]; then pass "loads nothing from the network"
  else fail "$ext external asset reference(s)"; fi

  missing=""
  for id in wfd-css wfd-app wfd-runtime wfd-prompt wfd-starter; do
    grep -q "id=\"$id\"" index.html || missing="$missing $id"
  done
  if [ -z "$missing" ]; then pass "carries the renderer, the styles, the prompt and an example"
  else fail "missing payload:$missing"; fi

  # Every element the interaction layer reaches for by id. A refactor once
  # dropped the detail modal and every box on every sheet silently stopped
  # opening, because nothing checked that the markup still existed.
  # Markup and behaviour must both survive a refactor. Checking only the markup
  # once reported green on a page whose entire builder had been deleted from the
  # script, which is the mirror image of the bug this guard was written for.
  hooks=""; dead=""
  for id in modal modal-body modal-nav modal-prev modal-next modal-close \
            build-modal build-input build-render build-status build-report \
            build-example build-source modal-review prompt-view prompt-download shortcuts \
            review-toggle review-export review-clear review-dirty \
            review-publish review-publish-row review-by review-publish-go review-publish-cancel \
            build-handle build-again build-open build-where build-note \
            mor-why mark-note mor-said build-theme toast; do
    grep -q "id=\"$id\"" index.html || hooks="$hooks $id"
    grep -q -- "$id" src/assets/app.js || dead="$dead $id"
  done
  if [ -z "$hooks" ]; then pass "every element the interaction layer needs is present"
  else fail "markup the scripts depend on is missing:$hooks"; fi
  if [ -z "$dead" ]; then pass "and the script still reaches for every one of them"
  else fail "markup exists but nothing listens to it:$dead"; fi

  # match rendered tags only; the template literal inside the embedded
  # renderer has a ${...} where a real id would be
  docs=$(grep -oE 'class="wfd-doc" data-doc="[a-z0-9-]+"' index.html | wc -l | tr -d ' ')
  [ "$docs" -gt 0 ] && pass "carries $docs example document(s)" || fail "carries no examples"
fi

step "same input, same bytes"
node src/build/library.mjs -o /tmp/wfd-a.html >/dev/null 2>&1
node src/build/library.mjs -o /tmp/wfd-b.html >/dev/null 2>&1
if cmp -s /tmp/wfd-a.html /tmp/wfd-b.html; then pass "index.html builds identically twice"
else fail "the build is not deterministic"; fi
rm -f /tmp/wfd-a.html /tmp/wfd-b.html

if [ "$want_svg" -eq 1 ]; then
  step "standalone svg"
  if out=$(node src/build/export-svg.mjs "${examples[@]}" -o out/svg 2>&1); then
    pass "out/svg  ${DIM}$(printf '%s\n' "$out" | grep -c '\.svg') sheet(s)${OFF}"
  else fail "svg export"; printf '%s\n' "$out" | sed 's/^/      /'; fi
fi

if [ "$want_standalone" -eq 1 ]; then
  step "prompt with the renderer inside it"
  if out=$(node src/build/self-contained.mjs 2>&1); then
    pass "out/workflow-prompt-standalone.md  ${DIM}$(printf '%s\n' "$out" | grep 'whole file' | sed 's/.*whole file *//')${OFF}"
  else fail "self-contained prompt"; printf '%s\n' "$out" | sed 's/^/      /'; fi
fi

printf '\n'
if [ "$fails" -eq 0 ]; then
  printf '%sindex.html is ready to send%s  %s%s%s\n' "$GRN" "$OFF" "$DIM" "$(du -h index.html | cut -f1)" "$OFF"
else
  printf '%s%d check(s) failed%s\n' "$RED" "$fails" "$OFF"
fi
exit "$fails"
