# Monitoring et réponse incident (Nexus / Inboundless)

Guide court pour l’exploitation au quotidien et les incidents. À adapter (contacts, canaux, gravité).

## Où regarder en premier

| Zone | Quoi | Action typique |
|------|------|----------------|
| **App Next.js** | [Sentry](https://sentry.io) (issues, performance, replays) | Triage par fréquence / impact, assignation, correctif ou rollback |
| **Uptime** | Sondes HTTP (voir ci‑dessous) | Si KO : statut hébergeur (Vercel), DNS, déploiement récent |
| **Backend Convex** | Dashboard Convex (logs fonctions, erreurs, usage) | Identifier mutation/query en échec, quota, latence |
| **Auth** | Dashboard Clerk (sessions, orgs) | Incidents liés aux comptes / webhooks |
| **Audit produit** | Table `auditLogs` (Convex) + page app **`/org/audit`** (admins) | Traçabilité ; export CSV jusqu’à 2000 lignes depuis l’UI |

## Endpoints de santé (sondes)

Configurer au moins une sonde externe (intervalle 1–5 min) sur :

1. **Web** : `GET /api/health` sur l’URL publique de l’app (réponse JSON `ok: true`).
2. **Convex HTTP** : `GET …/health` sur l’URL HTTP du déploiement Convex (même host que vos routes HTTP Convex, ex. `https://<deployment>.convex.site/health`).  
   - `GET /ping` renvoie toujours `pong` (check minimal alternatif).

Attendu : statut **200** et corps JSON avec `ok: true`. Aucun secret dans ces réponses.

## Détection → réponse (processus léger)

1. **Confirmer** : l’alerte est-elle réelle (pas un faux positif de sonde / quota) ?
2. **Qualifier** : utilisateurs impactés, données exposées ou perdues, dégradation partielle ou totale.
3. **Conserver** : captures d’écran Sentry, horodatage, version déployée (`commit` dans `/api/health` si Vercel).
4. **Limiter** : rollback Vercel, désactivation d’un flag, désactivation d’une route si nécessaire (avec mesure de garde).
5. **Corriger** : correctif minimal, puis déploiement.
6. **Communiquer** : message utilisateurs / clients selon gravité (SLA interne à définir).
7. **Post-mortem** (si incident significatif) : causes racines, actions préventives, tickets de suivi.

## Fuite de secrets ou accès non autorisé

- Révoquer / faire tourner les clés concernées (Clerk, Convex, Slack, Salesforce, OpenAI, etc.).
- Vérifier les **audit logs** et l’historique Clerk.
- Si données personnelles : traiter selon votre politique RGPD / DPA (notification superviseur, registre, etc.).

## Améliorations possibles (hors scope immédiat)

- Alertes Sentry (Slack / PagerDuty) sur nouveaux issues ou taux d’erreur.
- Budgets Convex / quotas avec alertes.
- Runbook par scénario (auth down, Convex down, paiement).

---

Document vivant : à mettre à jour quand l’URL de prod, les contacts on-call ou les outils changent.
