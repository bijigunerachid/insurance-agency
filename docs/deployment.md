# Installation et mises à jour du serveur de l'agence

Guide pas à pas pour le responsable de l'agence et le technicien informatique. Chaque étape dit quoi faire,
puis comment vérifier. Les choix ont été validés par le propriétaire le 30/10/2026 :
un mini-PC dédié, les PC du bureau seulement (réseau câblé), 4 à 10 postes, au plus 15 minutes de travail perdu et une reprise le jour même
(sauvegardes : [backup-restore.md](backup-restore.md)).

**L'adresse de l'application** se choisit pour chaque agence, à l'installation (réglage `APP_HOST`, en
`.internal`). Ce guide prend l'exemple **https://agence.internal** : remplacez-le partout par l'adresse
choisie.

```
  PC du bureau (Chrome / Edge)               Serveur (mini-PC, dans un endroit fermé)
  https://agence.internal  ──réseau──▶  proxy (HTTPS, écrans) ──▶ api ──▶ base de données
                                    câblé                                │
                                                                         └─▶ scans et documents
  Pas de port ouvert sur Internet. Le travail quotidien ne demande pas Internet.
```

Rien de propre à une agence n'est dans le code : nom, coordonnées, logo et adresse sont des réglages
du serveur. Une autre agence = une autre installation (README, « A new agency »).

## 0. Ce qu'il faut

| Élément | Détail |
|---|---|
| Mini-PC | 4 cœurs ou plus (classe Intel N100/N305 ou mieux), **16 Go de RAM**, 2 disques (SSD système + SSD ou disque de données), **TPM 2.0**, Ethernet gigabit |
| Onduleur (UPS) | Pour le serveur et la box : quelques minutes pour s'arrêter proprement |
| 2 disques USB | Pour les sauvegardes chiffrées, échangés chaque semaine (un reste chez le responsable) |
| Une clé USB | Pour installer Ubuntu, puis apporter les versions de l'application |
| Le PC admin | Le seul autorisé à se connecter au serveur en SSH |

## 1. Préparer le réseau du bureau

1. Dans la box Internet, donnez une **adresse fixe** au serveur (réservation DHCP), par exemple
   `192.168.50.10`, et au PC admin (par exemple `192.168.50.20`). Des réservations pour les PC des agents
   sont recommandées.
2. Le nom **agence.internal** doit mener au serveur sur chaque PC :
   - si la box permet des noms locaux (DNS), ajoutez `agence.internal → 192.168.50.10` ;
   - sinon, sur chaque PC, ouvrez le Bloc-notes **en administrateur**, fichier
     `C:\Windows\System32\drivers\etc\hosts`, ajoutez la ligne `192.168.50.10 agence.internal`.
3. Aucune redirection de port (NAT) vers le serveur dans la box. UPnP et administration à distance
   de la box désactivés, mot de passe de la box changé.
4. Le Wi-Fi du bureau (s'il existe) reste séparé du réseau câblé, ou en isolation « invités ».

**Vérifier :** sur un PC, `ping agence.internal` répond depuis `192.168.50.10`.

## 2. Installer Ubuntu Server et Docker

1. Ubuntu Server LTS : 26.04 LTS si sa première mise à jour (26.04.1) est sortie et que Docker la prend
   en charge, sinon 24.04 LTS. Pendant l'installation : chiffrement du disque recommandé (avec TPM pour
   redémarrer sans saisie), un compte administrateur nominatif, **OpenSSH server** coché.
2. Mises à jour de sécurité automatiques :
   ```bash
   sudo apt update && sudo apt full-upgrade -y
   sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
   ```
3. Docker Engine depuis le dépôt officiel de Docker (pas le paquet « docker.io ») : suivez
   « Install Docker Engine on Ubuntu » sur docs.docker.com, puis vérifiez :
   ```bash
   sudo docker run --rm hello-world
   docker compose version
   ```
4. SSH par clé seulement : copiez la clé du PC admin (`ssh-copy-id` ou le fichier
   `~/.ssh/authorized_keys`), puis dans `/etc/ssh/sshd_config` : `PasswordAuthentication no`,
   `PermitRootLogin no`, et `sudo systemctl restart ssh`.

## 3. L'heure du serveur

Les codes à 6 chiffres (connexion en deux étapes) et les heures du journal d'audit dépendent de l'horloge
du serveur, qui travaille sans Internet.

```bash
timedatectl                       # « System clock synchronized: yes » attendu
sudo timedatectl set-ntp true     # synchronisation automatique quand Internet est là
```

Si la box fournit l'heure (NTP), indiquez-la dans `/etc/systemd/timesyncd.conf` (`NTP=192.168.50.1`) puis
`sudo systemctl restart systemd-timesyncd`. Sans aucune source : réglez-la à la main
(`sudo timedatectl set-time "2026-11-02 08:30:00"`), en heure UTC ou après `timedatectl set-timezone
Africa/Casablanca`.

**Vérifier :** la page « État du système » de l'application affiche « Horloge du serveur : À l'heure »
(elle compare avec l'heure du PC ; au-delà d'une minute d'écart : « À régler »).

## 4. Le pare-feu

Copiez le dossier de la version (étape 5) sur le serveur, puis :

```bash
cd /chemin/vers/insurance-agency-<version>
sudo ./firewall.sh 192.168.50.0/24 192.168.50.20     # réseau du bureau, PC admin
```

Il ferme tout ce qui entre, sauf SSH depuis le PC admin, et laisse le réseau du bureau atteindre
l'application (443, et 80 qui renvoie vers 443). Docker ouvrant ses ports avant ufw, une règle
`DOCKER-USER` filtre aussi les conteneurs (docs/network.md §4).

**Vérifier depuis un PC d'agent (PowerShell)**, une fois l'application installée :

```powershell
Test-NetConnection agence.internal -Port 443    # TcpTestSucceeded : True
Test-NetConnection agence.internal -Port 22     # False (seul le PC admin)
Test-NetConnection agence.internal -Port 5432   # False (la base n'est jamais ouverte)
```

## 5. Première installation

1. Copiez le dossier `insurance-agency-<version>` de la clé USB sur le serveur (par exemple dans
   `/opt/insurance-agency-versions/`).
2. Lancez :
   ```bash
   cd /opt/insurance-agency-versions/insurance-agency-<version>
   sudo ./install.sh
   ```
   La première fois, il vérifie les fichiers, crée `/opt/insurance-agency` et ses fichiers de réglages, puis
   s'arrête.
3. Remplissez les réglages (lisibles par root seulement) :
   ```bash
   sudo nano /opt/insurance-agency/.env          # LAN_IP, mot de passe du propriétaire de la base
   sudo nano /opt/insurance-agency/.env.admin    # le même mot de passe dans l'adresse
   sudo nano /opt/insurance-agency/.env.api      # mot de passe de l'application, clé, coordonnées de l'agence
   ```
   - Mots de passe : `openssl rand -hex 24`, deux fois (le propriétaire de la base, puis l'application :
     deux mots de passe différents ; lettres et chiffres seulement, sans souci dans les adresses
     `postgresql://`). Clé : `openssl rand -base64 32` pour `TOTP_ENCRYPTION_KEY`.
   - **Notez la clé `TOTP_ENCRYPTION_KEY` et les mots de passe** dans le classeur de secours (papier, au
     coffre) : sans la clé, chaque utilisateur devra refaire sa connexion en deux étapes.
   - Coordonnées de l'agence (`AGENCY_*`) : depuis le papier à en-tête.
   - Logo et icône : copiez-les dans `/opt/insurance-agency/agency/` (`logo.png`, `icon.png`), puis
     `AGENCY_LOGO_FILE=/data/agency/logo.png` et `AGENCY_ICON_FILE=/data/agency/icon.png`.
4. Relancez `sudo ./install.sh` : il charge les images, prépare la base de données et démarre
   l'application. À la fin : « Version … installée ».

En cas de réglage refusé, l'application ne démarre pas et dit lequel :
`sudo docker compose -f /opt/insurance-agency/compose.yml logs api --tail 20`.

## 6. Le premier administrateur et le catalogue

```bash
cd /opt/insurance-agency
sudo docker compose run --rm -it tools node scripts/create-admin.js
sudo docker compose run --rm -it tools node scripts/confirm-reference.js
```

Le mot de passe se tape sans s'afficher. À la première connexion, l'administrateur active la connexion en
deux étapes (Google Authenticator, Microsoft Authenticator…), puis crée les comptes des employés dans
« Utilisateurs ».

## 7. Le cadenas HTTPS sur chaque PC

Le serveur a sa propre autorité de certification. Sa partie publique s'installe une fois par PC :

```bash
sudo /opt/insurance-agency/export-root-ca.sh
```

Il crée `/opt/insurance-agency/insurance-agency-autorite-racine.crt` et affiche son **empreinte SHA-256**. Copiez le
fichier sur une clé USB, puis sur chaque PC :

1. double-cliquez le fichier, « Installer le certificat… », **Ordinateur local** ;
2. « Placer tous les certificats dans le magasin suivant » → **Autorités de certification racines de
   confiance** ;
3. vérifiez que l'empreinte (onglet « Détails ») est celle affichée sur le serveur.

La clé privée ne quitte jamais le serveur (volume `insurance-agency-proxy-data`, dans les sauvegardes). Le site
impose HTTPS (HSTS) : installez le certificat **avant** d'ouvrir l'application sur un PC.

## 8. Vérifier que tout fonctionne

Sur un PC du bureau :

1. `https://agence.internal` s'ouvre avec le cadenas, le logo de l'agence sur la page de connexion ;
2. l'administrateur se connecte ; « État du système » : serveur, base de données disponibles, horloge à
   l'heure ;
3. un reçu de test s'imprime sur une feuille A4 (deux exemplaires) ;
4. les vérifications du pare-feu de l'étape 4.

## 8 bis. Les sauvegardes

Avant d'utiliser l'application pour de vrai : la clé de sauvegarde, les deux disques et la sauvegarde
automatique, dans [backup-restore.md](backup-restore.md) (étapes 1 à 3).

## 9. Mettre à jour l'application

1. Le développeur prépare la version sur son ordinateur (avec Internet) :
   `powershell -File deployment/production/release.ps1 -Version 1.1.0`. Le dossier
   `release/insurance-agency-1.1.0` contient les images, les scripts et les sommes de contrôle.
2. Copiez le dossier sur la clé USB, puis sur le serveur.
3. Sur le serveur :
   ```bash
   cd /opt/insurance-agency-versions/insurance-agency-1.1.0
   sudo ./install.sh
   ```
   Il vérifie les fichiers (un fichier abîmé est refusé avant tout changement), charge les images, fait
   une sauvegarde (et s'arrête sans rien changer si elle échoue : disque branché ?), met à jour la base,
   redémarre, et affiche
   « Version 1.1.0 installée (avant : 1.0.0) ». Les données restent en place.

Prévenez les utilisateurs : l'application est indisponible une à deux minutes.

## 10. Si une mise à jour échoue

Le script s'arrête avec « La mise à jour a échoué. Version précédente : … ».

1. Lisez la cause : `sudo docker compose -f /opt/insurance-agency/compose.yml logs --tail 50`.
2. Une cause passagère (coupure, disque plein) : corrigez-la et relancez `sudo ./install.sh`.
3. Revenir à la version précédente, **seulement si la nouvelle n'a pas changé la base de données** :
   remettez l'ancien numéro dans `APP_VERSION` de `/opt/insurance-agency/.env`, puis
   `sudo docker compose -f /opt/insurance-agency/compose.yml up --detach --wait`.
   Si la base a changé : restauration de la sauvegarde prise juste avant la mise à jour
   ([backup-restore.md](backup-restore.md), étape 5, avec `--time` juste avant l'heure de la mise à jour).

## 11. Commandes utiles (sur le serveur)

```bash
cd /opt/insurance-agency
sudo docker compose ps                        # état des services
sudo docker compose logs api --tail 50        # journal de l'application
sudo docker compose restart api               # redémarrer l'application
sudo docker compose stop && sudo docker compose up --detach --wait
```

**Ne lancez jamais `docker compose down -v`** : `-v` efface les volumes, donc la base de données et les
documents.

Mises à jour d'Ubuntu, une fois par mois avec Internet : `sudo apt update && sudo apt full-upgrade -y`,
puis `sudo reboot` en dehors des heures de travail.

## 12. Répétition avant l'installation réelle (développeur)

Sur la VM Ubuntu (VMware), Internet coupé : étapes 2 à 8 avec une version de test, puis les vérifications
du pare-feu depuis une seconde machine. Le test de fumée automatique se lance depuis l'ordinateur du
développeur :

```powershell
$env:PRODUCTION_URL = 'https://agence.internal'
$env:SMOKE_USERNAME = '<un compte agent>'; $env:SMOKE_PASSWORD = '<son mot de passe>'
npm run test:production
```

Il vérifie HTTPS, les en-têtes de sécurité, qu'aucune requête ne sort du serveur, la connexion d'un agent
et une liste lue dans la base.
