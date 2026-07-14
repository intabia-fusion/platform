#!/usr/bin/env bash
# Realistic SaaS layout: partition U users (co1..coU) into workspaces sized 1-50 with a
# skew toward small teams (most ws 1-5 users, a few 21-50). Each user gets ONE home
# workspace here (cowsN reused as the multiuser workspace, owned by its first member).
# Writes a manifest ws->[users] for `recover-storm --manifest`, then assigns membership.
#
#   U=1000 PAR=10 ./make-multiuser.sh
set -uo pipefail
cd "$(dirname "$0")"
U=${U:-1000}
PAR=${PAR:-10}
PREFIX=${PREFIX:-co}
MANIFEST=${MANIFEST:-multiuser-manifest.json}
PAIRS=/tmp/multiuser-pairs.$$.txt

# Deterministic partition (seeded) so reruns are stable. Skew: 60% ws in 1-5, 30% in
# 6-20, 10% in 21-50.
U="$U" PREFIX="$PREFIX" MANIFEST="$MANIFEST" PAIRS="$PAIRS" node -e '
const U=Number(process.env.U), PREFIX=process.env.PREFIX;
let seed=12345; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
const pickSize=()=>{ const r=rnd(); if(r<0.60) return 1+Math.floor(rnd()*5); if(r<0.90) return 6+Math.floor(rnd()*15); return 21+Math.floor(rnd()*30); };
const manifest={}; const pairs=[]; let u=1, w=1;
while(u<=U){ const size=Math.min(pickSize(), U-u+1); const ws=`${PREFIX}ws${w}`; const users=[];
  for(let k=0;k<size;k++){ const e=`${PREFIX}${u}`; users.push(e); pairs.push(`${e} ${ws}`); u++; }
  manifest[ws]=users; w++; }
require("fs").writeFileSync(process.env.MANIFEST, JSON.stringify(manifest));
require("fs").writeFileSync(process.env.PAIRS, pairs.join("\n"));
const sizes=Object.values(manifest).map(a=>a.length);
console.log(`ws=${sizes.length} users=${U} sizes: min=${Math.min(...sizes)} max=${Math.max(...sizes)} avg=${(U/sizes.length).toFixed(1)}`);
const buck={"1-5":0,"6-20":0,"21-50":0}; for(const s of sizes){ if(s<=5)buck["1-5"]++; else if(s<=20)buck["6-20"]++; else buck["21-50"]++; }
console.log("ws by size:", JSON.stringify(buck));
'

assign_one() { ./tool-pg.sh assign-workspace "$1" "$2" >/dev/null 2>&1 && echo ok; }
export -f assign_one
start=$(date +%s)
n=$(xargs -P "$PAR" -L1 bash -c 'assign_one "$@"' _ < "$PAIRS" | wc -l)
rm -f "$PAIRS"
echo "assigned $n memberships in $(( $(date +%s) - start ))s -> $MANIFEST"
