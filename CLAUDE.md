## Organisation multi-agents (kit commun Olympic Location)

Règles valables pour toute session Claude (Slack, app Claude Code, terminal) :
- Toute modification passe par une branche et une PR draft ; jamais de commit direct sur la branche par défaut.
- Avant de proposer le merge : revue par l'agent `spider` (relecture), et par l'agent `cyber` (sécurité) si le changement touche paiements, secrets, authentification ou données clients.
- Lancer les tests du repo avant chaque push.
- Incident en prod : suivre l'agent `hulk` (réparateur : cause racine → correctif minimal en PR → prévention).
- Ne jamais poser de secrets dans le code ou les fichiers de config versionnés.
- Résumer chaque livraison : ce qui a été fait, et ce qui reste à faire côté humain (secrets, migrations, déploiement).
- Boucle d'apprentissage : quand une erreur, un incident ou une revue révèle une leçon réutilisable, mettre à jour le fichier d'agent concerné (`.claude/agents/`) ou ce CLAUDE.md dans la même PR — une leçon tient en quelques lignes de règle, jamais un log ni un historique.
