# Kit agents — Olympic Location

Ce dossier fait exister les mêmes agents partout où ce repo est ouvert :
dans Slack via Claude, dans l'app Claude Code, ou dans le terminal avec `claude`.
Les fichiers `.md` de ce dossier définissent chacun un agent, avec sa description
et ses consignes.

Trois agents sont fournis :
- **spider** — le relecteur : relit tout diff significatif avant push ou PR (bugs, cas limites, régressions).
- **cyber** — la revue sécurité : obligatoire sur les paiements, secrets, authentification et données clients.
- **hulk** — le réparateur : postmortem d'incident prod : cause racine, correctif minimal, prévention.

Les agents se déclenchent automatiquement grâce à leurs descriptions (Claude les
invoque de façon proactive quand le contexte correspond), ou à la demande :
« utilise l'agent cyber ».

Pour un NOUVEAU projet : copier le dossier `.claude/` et la section
« Organisation multi-agents » du `CLAUDE.md` — ou demander à Claude :
« reprends le kit agents de DamageCalc ».
