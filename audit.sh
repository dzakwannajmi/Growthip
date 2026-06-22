#!/usr/bin/env bash
#
# audit.sh — quick pre-submission security sweep for Growthip
#
# Checks (non-destructive, read-only):
#   1. console.log / console.* leaking sensitive data (secret, nullifier, key, password, seed, phrase)
#   2. env / secret / key files tracked by git
#   3. dependency vulnerabilities (npm audit + cargo audit if available)
#   4. hardcoded secrets (private keys, seed phrases) in source
#
# Usage:  bash audit.sh          (run from repo root, e.g. ~/growthip)
#
# Exit code 0 = nothing flagged, 1 = at least one finding to review.
# A "finding" is NOT proof of a bug — it's something to eyeball. Read each one.

set -uo pipefail

# ---- colors (disabled if not a tty) -------------------------------------
if [ -t 1 ]; then
  RED=$'\033[0;31m'; GRN=$'\033[0;32m'; YLW=$'\033[0;33m'; BLU=$'\033[0;34m'; BLD=$'\033[1m'; RST=$'\033[0m'
else
  RED=""; GRN=""; YLW=""; BLU=""; BLD=""; RST=""
fi

FINDINGS=0
section() { printf "\n${BLD}${BLU}== %s ==${RST}\n" "$1"; }
ok()      { printf "  ${GRN}✓ %s${RST}\n" "$1"; }
warn()    { printf "  ${RED}⚠ %s${RST}\n" "$1"; FINDINGS=$((FINDINGS+1)); }
note()    { printf "  ${YLW}• %s${RST}\n" "$1"; }

# ---- sanity: are we in the repo root? -----------------------------------
if [ ! -d .git ]; then
  printf "${RED}Not a git repo root. cd into ~/growthip first.${RST}\n"
  exit 2
fi

SRC_DIR="apps/web/src"
[ -d "$SRC_DIR" ] || SRC_DIR="."   # fallback if layout differs

# =========================================================================
section "1. console.* leaking sensitive data"
# Look for console.<anything> on a line that also mentions a sensitive token.
# Word-ish boundaries to cut noise (e.g. 'secretKey', 'nullifierHash' still match).
SENSITIVE='secret|nullifier|privkey|private_?key|privateKey|password|passphrase|mnemonic|seed|recovery.?phrase|wrapped.?key|toxic'
if [ -d "$SRC_DIR" ]; then
  hits=$(grep -rniE "console\.(log|info|debug|warn|error|table|dir)" "$SRC_DIR" 2>/dev/null \
          | grep -iE "$SENSITIVE" \
          | grep -viE "//.*console|/\*|console\.(log|error)\(['\"\`][^,]*(error|failed|invalid)['\"\`]\s*\)" || true)
  if [ -z "$hits" ]; then
    ok "No console.* calls reference sensitive tokens."
  else
    warn "console.* lines mentioning sensitive data — review each:"
    printf "%s\n" "$hits" | sed 's/^/      /'
    note "A console.log of an *error message* containing the word 'secret' is fine."
    note "A console.log of an actual secret/nullifier/key VALUE is not. Read carefully."
  fi
else
  note "Source dir not found; skipped."
fi

# =========================================================================
section "2. env / secret / key files tracked by git"
# Files git is actually tracking that look like they hold secrets.
tracked=$(git ls-files | grep -iE '(^|/)\.env($|\.)|secret|\.pem$|\.key$|id_rsa|keystore|wallet.*\.json$|\.p12$' \
           | grep -viE '\.env\.example$|\.env\.sample$|\.env\.template$' || true)
if [ -z "$tracked" ]; then
  ok "No env/secret/key files are tracked by git."
else
  warn "Git is tracking files that may contain secrets:"
  printf "%s\n" "$tracked" | sed 's/^/      /'
  note "If any holds a real key/seed, remove from tracking AND rotate it:"
  note "  git rm --cached <file> ; echo '<file>' >> .gitignore"
  note "Removing now does NOT scrub git history — rotate the key if it was ever real."
fi

# Bonus: is .gitignore covering the usual suspects?
if [ -f .gitignore ]; then
  for pat in ".env" ".env.local" "node_modules"; do
    grep -qF "$pat" .gitignore || note ".gitignore does not mention '$pat' (verify it's covered another way)."
  done
fi

# =========================================================================
section "3. dependency vulnerabilities"
# --- npm ---
WEB_DIR="apps/web"
[ -f package.json ] && WEB_DIR="."
if [ -f "$WEB_DIR/package.json" ]; then
  if command -v npm >/dev/null 2>&1; then
    note "Running 'npm audit' in $WEB_DIR (high/critical only)…"
    audit_json=$(cd "$WEB_DIR" && npm audit --json 2>/dev/null || true)
    if [ -n "$audit_json" ]; then
      crit=$(printf "%s" "$audit_json" | grep -oE '"critical":[0-9]+' | head -1 | grep -oE '[0-9]+' || echo 0)
      high=$(printf "%s" "$audit_json" | grep -oE '"high":[0-9]+'     | head -1 | grep -oE '[0-9]+' || echo 0)
      crit=${crit:-0}; high=${high:-0}
      if [ "$crit" -gt 0 ] || [ "$high" -gt 0 ]; then
        warn "npm: ${crit} critical, ${high} high vulnerabilities. Run 'npm audit' for detail."
        note "Triage: 'npm audit fix' for safe fixes; check breaking changes before --force."
      else
        ok "npm: no high/critical vulnerabilities."
      fi
    else
      note "npm audit produced no output (offline? no lockfile?). Run manually."
    fi
  else
    note "npm not found; skipped."
  fi
else
  note "No package.json found; skipped npm audit."
fi

# --- cargo ---
if [ -d contracts ] || ls Cargo.toml >/dev/null 2>&1; then
  if command -v cargo-audit >/dev/null 2>&1 || cargo audit --version >/dev/null 2>&1; then
    note "Running 'cargo audit' (contracts workspace)…"
    CARGO_DIR="contracts"; [ -f Cargo.toml ] && CARGO_DIR="."
    ca=$(cd "$CARGO_DIR" 2>/dev/null && cargo audit 2>&1 || true)
    if printf "%s" "$ca" | grep -qiE 'error: [0-9]+ vulnerabilit|Crate:.*RUSTSEC'; then
      warn "cargo audit reported vulnerabilities — review:"
      printf "%s" "$ca" | grep -iE 'RUSTSEC|Crate:|Title:|Solution:|vulnerabilit' | sed 's/^/      /' | head -30
    else
      ok "cargo audit: no vulnerabilities reported."
    fi
  else
    note "cargo-audit not installed. Install once with: cargo install cargo-audit"
    note "Then re-run this script to include Rust dependency checks."
  fi
else
  note "No contracts/Cargo.toml found; skipped cargo audit."
fi

# =========================================================================
section "4. hardcoded secrets in source"
# Stellar secret keys start with 'S' + 55 base32 chars. Public keys start 'G' (those are fine).
# Also look for 12/24-word mnemonic literals and obvious private-key hex blobs.
if [ -d "$SRC_DIR" ]; then
  # Stellar secret seed pattern (S + 55 uppercase base32). Exclude obvious test/zero values.
  skeys=$(grep -rnoE 'S[A-Z2-7]{54,56}' "$SRC_DIR" 2>/dev/null | grep -viE 'SAAAAA|EXAMPLE|TEST|XXXX' || true)
  if [ -z "$skeys" ]; then
    ok "No Stellar secret-key literals (S...) found in source."
  else
    warn "Possible Stellar SECRET keys hardcoded in source:"
    printf "%s\n" "$skeys" | sed 's/^/      /'
    note "If real, rotate immediately and move to env vars. (Public G... keys are fine.)"
  fi

  # 64-hex private-key-looking blobs assigned to a key-ish variable
  hexkeys=$(grep -rniE '(priv|secret|seed).{0,20}=.{0,5}["\x27][0-9a-f]{64}["\x27]' "$SRC_DIR" 2>/dev/null || true)
  if [ -n "$hexkeys" ]; then
    warn "64-hex blob assigned to a key-named variable — review:"
    printf "%s\n" "$hexkeys" | sed 's/^/      /'
  else
    ok "No obvious 64-hex private-key literals in source."
  fi
else
  note "Source dir not found; skipped."
fi

# =========================================================================
printf "\n${BLD}== summary ==${RST}\n"
if [ "$FINDINGS" -eq 0 ]; then
  printf "  ${GRN}${BLD}No findings flagged.${RST} Eyeball the yellow notes above, but nothing jumped out.\n"
  exit 0
else
  printf "  ${RED}${BLD}%s finding(s) to review.${RST} None are auto-confirmed bugs — read each one.\n" "$FINDINGS"
  exit 1
fi