# Sauvegardes et restauration

Guide pour le responsable de l'agence et le technicien informatique. Choix validés par le propriétaire le
30/10/2026 : **au plus 15 minutes de travail perdu**, **reprise le jour même** (environ 4 heures),
**deux disques USB chiffrés échangés chaque semaine, l'un gardé chez le responsable**.

## Comment ça marche

```
  Base de données ──(chaque modification, au plus 5 min)──▶ archive sur le serveur
         │                                                        │
         │            toutes les 5 minutes (minuteur) : backup.sh run, chiffré avec la clé publique
         ▼                                                        ▼
  une copie complète par jour  ─────────────────────────▶  disque USB branché (A ou B)
  + réglages + autorité HTTPS                                + scans et documents nouveaux
```

- **Toutes les 5 minutes**, le serveur copie sur le disque branché les modifications de la base, les
  nouveaux scans et documents, et prend une **copie complète** si ce disque n'en a pas encore du jour
  (donc aussi juste après un échange de disque). Deux semaines de copies complètes sont gardées sur chaque
  disque.
- **Tout est chiffré** (outil `age`) avec la **clé publique** de l'agence. Le serveur peut chiffrer, mais
  pas relire : seule la **clé privée**, gardée hors du serveur, permet de restaurer. Un disque perdu ou
  volé ne révèle rien.
- La page **« État du système »** de l'application dit si la sauvegarde est à jour, quel disque est branché
  et la place libre ; sinon « À vérifier » avec la raison (aucun disque, sauvegarde arrêtée, pas de copie
  complète depuis plus d'un jour).
- `install.sh` fait une sauvegarde **avant chaque mise à jour**, et s'arrête sans rien changer si elle
  échoue.

## 1. La clé de sauvegarde (une seule fois)

```bash
cd /opt/insurance-agency
sudo ./backup.sh init-key
```

La **clé privée** s'affiche **une seule fois** (une ligne `AGE-SECRET-KEY-…`). Immédiatement :

1. recopiez-la sur papier, à garder au coffre avec les mots de passe et la clé `TOTP_ENCRYPTION_KEY` ;
2. enregistrez-la aussi dans un fichier `cle-sauvegarde.txt` sur une clé USB gardée **chez le
   responsable** (jamais avec les disques de sauvegarde, jamais sur le serveur).

**Sans la clé privée, aucune sauvegarde ne peut être relue.** La clé publique reste sur le serveur
(`backup-recipient.txt`) et dans chaque sauvegarde.

## 2. Préparer les deux disques (une fois chacun)

Chaque disque est formaté une fois (cela **efface** son contenu) avec le nom `AGENCY-BACKUP` :

```bash
lsblk -f                                   # repérez le disque USB (ex. /dev/sdb1), PAS le disque du serveur
sudo mkfs.ext4 -L AGENCY-BACKUP /dev/sdb1      # vérifiez deux fois le nom du disque
sudo mkdir -p /mnt/agency-backup
```

Montage automatique quand un des deux disques est branché, dans `/etc/fstab` (une seule ligne pour les
deux, ils portent le même nom) :

```
LABEL=AGENCY-BACKUP  /mnt/agency-backup  ext4  nofail,noatime,x-systemd.automount,x-systemd.device-timeout=10  0  2
```

Puis `sudo systemctl daemon-reload`, branchez le disque A, et :

```bash
cd /opt/insurance-agency
sudo ./backup.sh prepare-disk A
```

Débranchez-le (`sudo umount /mnt/agency-backup`), branchez le disque B, `sudo ./backup.sh prepare-disk B`.
Collez une étiquette « A » et « B » sur les disques.

## 3. Lancer la sauvegarde automatique

```bash
sudo ./backup.sh install-timer     # toutes les 5 minutes, et au démarrage du serveur
sudo ./backup.sh run               # une première sauvegarde tout de suite
sudo ./backup.sh status            # copies complètes, dernière copie, place libre
```

**Vérifier :** « État du système » affiche « Sauvegardes : À jour — Disque A… ».

## 4. L'échange de disque, chaque semaine

Le même jour chaque semaine (par exemple le vendredi soir) :

1. `sudo umount /mnt/agency-backup`, débranchez le disque, emportez-le **chez vous** ;
2. branchez l'autre disque (ramené de chez vous) ;
3. dans les 5 minutes, le serveur prend une copie complète sur ce disque ; « État du système » affiche
   « À jour » avec la lettre du disque.

Tant qu'aucun disque n'est branché, les modifications restent sur le serveur (rien n'est perdu), et la
page affiche « Aucun disque de sauvegarde branché ».

## 5. Restaurer

**Gardez votre calme : la restauration ne touche à rien avant que vous tapiez `RESTAURER`.** Il faut :
le disque de sauvegarde le plus récent, et la clé privée (`cle-sauvegarde.txt`, ou retapée depuis le
papier dans un fichier).

### Le serveur est perdu (panne, vol, incendie)

1. Nouveau serveur : étapes 1 à 4 de [deployment.md](deployment.md) (réseau, Ubuntu, Docker, heure,
   pare-feu), puis `sudo ./install.sh` **une fois** depuis le dossier de la dernière version (il prépare
   `/opt/insurance-agency` et s'arrête : ne remplissez pas les réglages, ils sont dans la sauvegarde).
2. Le disque de sauvegarde monté sur `/mnt/agency-backup` (étape 2, ligne `fstab`), puis :
   ```bash
   cd /opt/insurance-agency
   sudo ./backup.sh restore --identity /media/cle/cle-sauvegarde.txt --with-settings
   ```
   Il restaure les réglages, le logo, l'autorité HTTPS (les PC gardent leur cadenas), la base de données
   jusqu'à la dernière modification copiée, puis les documents, démarre l'application, prend une copie
   complète, et affiche la durée.
3. `sudo ./backup.sh install-timer`, puis les vérifications de l'étape 8 de deployment.md.

### Une erreur à annuler (données effacées par erreur) sur le même serveur

Restaurer l'état d'avant l'erreur, heure **UTC** (heure du Maroc moins une heure en général) :

```bash
sudo ./backup.sh restore --identity /media/cle/cle-sauvegarde.txt --time "2026-11-02 09:30:00"
```

Tout ce qui a été saisi après cette heure est perdu : notez-le avant de lancer.

## 6. Tester la restauration (tous les trois mois)

Une sauvegarde jamais relue ne prouve rien. Tous les trois mois, sur un serveur de test ou un PC de
secours (jamais sur le serveur en service) : la restauration « serveur perdu » ci-dessus avec le disque de
la semaine, puis connexion d'un employé et ouverture d'un document. Notez la date et la durée.

Le développeur dispose aussi d'un exercice automatique sur son ordinateur Windows
(`deployment/rehearsal/run-drill.ps1`, voir docs/testing.md). C'est un autre test que la restauration
sur le serveur de test (deployment.md §12) : il ne remplace pas l'essai sur un vrai serveur Ubuntu.

## Ce que contient une sauvegarde

| Élément | Fréquence | Pourquoi |
|---|---|---|
| Base de données (copie complète) | une par jour et par disque | Point de départ d'une restauration |
| Modifications de la base (WAL) | au plus 5 min sur le serveur, 5 min de plus vers le disque | Revenir à la dernière minute (au plus 15 minutes perdues) |
| Scans et documents | toutes les 5 minutes (les nouveaux) | Les pièces des contrats |
| Réglages (`.env`, `.env.api`, `.env.admin`), logo | avec chaque copie complète | Remettre le serveur tel qu'il était |
| Autorité HTTPS (clé privée comprise) | avec chaque copie complète | Les PC gardent leur certificat installé |

Ne sont **pas** dans la sauvegarde : la clé privée de sauvegarde (par principe), les images de
l'application (elles sont sur la clé USB de la version).
