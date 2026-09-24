#!/usr/bin/env node
// GIT PRACTICE — read-only měření: jak často se commituje, pushuje, merguje; jak dlouho je práce jen lokálně; kvalita commitů.
// node tools/git-practice.mjs <repo> [--days 90] > AUDIT/01_nalezy/git-practice.json
import path from 'node:path'; import fs from 'node:fs'; import { execSync } from 'node:child_process';
const repo = path.resolve(process.argv[2] || '.'); const days = +((process.argv.join(' ').match(/--days\s+(\d+)/) || [])[1] || 90);
const sh = c => { try { return execSync(c, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 128e6 }).trim(); } catch { return ''; } };
const day = t => new Date(t).toISOString().slice(0, 10);
const remotes = sh('git remote -v').split('\n').filter(Boolean);
const branch = sh('git rev-parse --abbrev-ref HEAD'); const upstream = sh(`git rev-parse --abbrev-ref ${branch}@{upstream}`);
sh('git fetch --quiet --all 2>/dev/null');
// commity
const log = sh(`git log --since="${days} days ago" --all --no-merges --format="%H|%ct|%an|%s" --shortstat`).split('\n');
const commits = []; for (let i = 0; i < log.length; i++) { const l = log[i]; if (!l.includes('|')) continue; const [h, ts, an, ...s] = l.split('|'); const stat = (log[i + 1] || '') + (log[i + 2] || ''); const ins = +(stat.match(/(\d+) insertion/) || [])[1] || 0, del = +(stat.match(/(\d+) deletion/) || [])[1] || 0, files = +(stat.match(/(\d+) files? changed/) || [])[1] || 0; commits.push({ h, t: +ts * 1000, an, s: s.join('|'), ins, del, files }); }
commits.sort((a, b) => a.t - b.t);
const activeDays = [...new Set(commits.map(c => day(c.t)))].sort();
const gaps = []; for (let i = 1; i < activeDays.length; i++) { const g = (Date.parse(activeDays[i]) - Date.parse(activeDays[i - 1])) / 864e5; if (g > 3) gaps.push({ from: activeDays[i - 1], to: activeDays[i], days: g }); }
const lastCommitAge = commits.length ? (Date.now() - commits.at(-1).t) / 864e5 : null;
const msgBad = commits.filter(c => /^(wip|fix|update|changes|test|asdf|\.|x|tmp|temp|misc|stuff|more|again|final)\b/i.test(c.s) || c.s.trim().length < 8).length;
const huge = commits.filter(c => c.ins + c.del > 1000 || c.files > 40);
const conventional = commits.filter(c => /^(feat|fix|chore|docs|refactor|test|perf|ci|build|style)(\(.+\))?!?:/.test(c.s)).length;
// push = kdy se změny dostaly na remote: reflog upstreamu (jen lokální stroj) + porovnání local vs remote
const ahead = upstream ? +sh(`git rev-list --count ${upstream}..HEAD`) : null; const behind = upstream ? +sh(`git rev-list --count HEAD..${upstream}`) : null;
const oldestUnpushed = upstream && ahead ? sh(`git log ${upstream}..HEAD --format=%ct | tail -1`) : ''; const unpushedAgeDays = oldestUnpushed ? (Date.now() - oldestUnpushed * 1000) / 864e5 : 0;
const pushReflog = upstream ? sh(`git reflog show --date=iso ${upstream} 2>/dev/null | head -200`).split('\n').filter(Boolean) : [];
const pushDates = [...new Set(pushReflog.map(l => (l.match(/\{(\d{4}-\d{2}-\d{2})/) || [])[1]).filter(Boolean))];
const remoteLast = upstream ? sh(`git log -1 --format=%ct ${upstream}`) : ''; const remoteAgeDays = remoteLast ? (Date.now() - remoteLast * 1000) / 864e5 : null;
// merge/branching
const merges = +sh(`git rev-list --count --merges --since="${days} days ago" --all`); const branches = sh('git for-each-ref --format="%(refname:short)|%(committerdate:short)" refs/heads').split('\n').filter(Boolean);
const unmerged = sh('git branch --no-merged HEAD --format=%(refname:short)').split('\n').filter(Boolean);
const longLived = branches.map(l => { const [n, d] = l.split('|'); return { n, days: Math.round((Date.now() - Date.parse(d)) / 864e5) }; }).filter(b => !/^(main|master|develop)$/.test(b.n) && b.days > 14);
const tags = sh('git tag --sort=-creatordate | head -10').split('\n').filter(Boolean);
// pracovní strom
const dirty = sh('git status --porcelain').split('\n').filter(Boolean); const dirtyOldest = dirty.length ? Math.min(...dirty.map(l => { try { return fs.statSync(path.join(repo, l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop())).mtimeMs; } catch { return Date.now(); } })) : null;
const stashes = sh('git stash list').split('\n').filter(Boolean).length;
const hooksInstalled = ['pre-commit', 'pre-push'].filter(h => sh(`test -x .git/hooks/${h} && echo y`) === 'y');
const protection = { husky: sh('test -d .husky && echo y') === 'y', lefthook: sh('test -f lefthook.yml && echo y') === 'y', ci: sh('ls .github/workflows 2>/dev/null') !== '' };

const perWeek = commits.length / Math.max(1, days / 7);
const verdict = !remotes.length ? '🔴 žádný remote — kód není zálohovaný mimo stroj'
  : (ahead > 20 || unpushedAgeDays > 7) ? '🔴 nepushnutá práce > 7 dní / > 20 commitů'
  : (lastCommitAge > 14 && dirty.length) ? '🔴 rozpracováno bez commitu > 14 dní'
  : (perWeek < 2 || huge.length / Math.max(1, commits.length) > 0.2 || msgBad / Math.max(1, commits.length) > 0.3) ? '🟡'
  : '🟢';
console.log(JSON.stringify({ repo, branch, upstream: upstream || null, remotes, window_days: days,
  commits: { count: commits.length, per_week: +perWeek.toFixed(1), active_days: activeDays.length, last_commit_age_days: lastCommitAge && +lastCommitAge.toFixed(1), gaps_over_3_days: gaps, huge_commits: huge.map(c => ({ h: c.h.slice(0, 8), s: c.s.slice(0, 60), lines: c.ins + c.del, files: c.files })), bad_messages_ratio: +(msgBad / Math.max(1, commits.length)).toFixed(2), conventional_ratio: +(conventional / Math.max(1, commits.length)).toFixed(2), authors: [...new Set(commits.map(c => c.an))] },
  push: { ahead_of_remote: ahead, behind_remote: behind, oldest_unpushed_age_days: +unpushedAgeDays.toFixed(1), remote_last_commit_age_days: remoteAgeDays && +remoteAgeDays.toFixed(1), push_dates_seen_locally: pushDates.slice(0, 30), note: 'push_dates jen z lokálního reflogu; přes více strojů porovnej remote_last_commit_age' },
  merge: { merges_in_window: merges, branches: branches.length, unmerged_branches: unmerged, long_lived_over_14d: longLived, tags_latest: tags },
  worktree: { dirty_files: dirty.length, dirty_oldest_age_days: dirtyOldest && +((Date.now() - dirtyOldest) / 864e5).toFixed(1), stashes },
  guards: { git_hooks: hooksInstalled, ...protection },
  verdict, note: 'Cíl: commit ≥ denně při práci, push ≥ denně (záloha), žádná nepushnutá práce > 24 h, feature větve < 14 dní, commit < 400 řádků, zprávy popisné.' }, null, 2));
