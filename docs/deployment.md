# Installation et mises à jour du serveur de l'agence

Guide pas à pas pour le responsable de l'agence et le technicien informatique. Chaque étape dit quoi faire,
puis comment vérifier. Les choix ont été validés par le propriétaire le 30/10/2026 :
un mini-PC dédié, les PC du bureau seulement (réseau câblé), 4 à 10 postes, au plus 15 minutes de travail perdu et une reprise le jour même
(sauvegardes : [backup-restore.md](backup-restore.md)).

**L'adresse de l'application** se choisit pour chaque agence, à l'installation (réglage `APP_HOST`, en
`.internal`). Ce guide prend l'exemple **https://insurance.internal** : remplacez-le partout par l'adresse
choisie.

```
  PC du bureau (Chrome / Edge)               Serveur (mini-PC, dans un endroit fermé)
  https://insurance.internal  ──réseau──▶  proxy (HTTPS, écrans) ──▶ api ──▶ base de données
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
2. Le nom **insurance.internal** doit mener au serveur sur chaque PC :
   - si la box permet des noms locaux (DNS), ajoutez `insurance.internal → 192.168.50.10` ;
   - sinon, sur chaque PC, ouvrez le Bloc-notes **en administrateur**, fichier
     `C:\Windows\System32\drivers\etc\hosts`, ajoutez la ligne `192.168.50.10 insurance.internal`.
3. Aucune redirection de port (NAT) vers le serveur dans la box. UPnP et administration à distance
   de la box désactivés, mot de passe de la box changé.
4. Le Wi-Fi du bureau (s'il existe) reste séparé du réseau câblé, ou en isolation « invités ».

**Vérifier :** sur un PC, `ping insurance.internal` répond depuis `192.168.50.10`.

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
Test-NetConnection insurance.internal -Port 443    # TcpTestSucceeded : True
Test-NetConnection insurance.internal -Port 22     # False (seul le PC admin)
Test-NetConnection insurance.internal -Port 5432   # False (la base n'est jamais ouverte)
```

## 5. Première installation

1. Copiez le dossier `insurance-agency-<version>` de la clé USB sur le serveur (par exemple dans
   `/opt/insurance-agency-versions/`). Copié depuis Windows (`scp`), le dossier perd ses droits : il
   devient illisible une fois à root et les scripts ne sont plus exécutables. Rendez-les-leur (le dossier
   ne contient aucun secret ; les empreintes ne changent pas) :
   ```bash
   sudo chown -R root:root /opt/insurance-agency-versions/insurance-agency-<version>
   sudo chmod -R u=rwX,go=rX /opt/insurance-agency-versions/insurance-agency-<version>
   cd /opt/insurance-agency-versions/insurance-agency-<version>
   sudo chmod +x install.sh firewall.sh export-root-ca.sh backup.sh
   sha256sum --check SHA256SUMS       # OK sur chaque ligne
   ```
2. Lancez :
   ```bash
   cd /opt/insurance-agency-versions/insurance-agency-<version>
   sudo ./install.sh
   ```
   La première fois, il vérifie les fichiers, crée `/opt/insurance-agency` et ses fichiers de réglages, puis
   s'arrête.
3. Remplissez les réglages (lisibles par root seulement). Le plus sûr : ce bloc crée les deux mots de
   passe et la clé et les écrit directement, sans les afficher (remplacez l'adresse du serveur). **Une
   seule fois** : relancé, il change le mot de passe de `.env` sans celui de `.env.admin` (voir plus bas).
   ```bash
   sudo -i
   cd /opt/insurance-agency
   OWNER=$(openssl rand -hex 24); RUNTIME=$(openssl rand -hex 24); KEY=$(openssl rand -base64 32)
   sed -i "s|^LAN_IP=.*|LAN_IP=192.168.50.10|; s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$OWNER|" .env
   sed -i "s|OWNER_PASSWORD|$OWNER|" .env.admin
   sed -i "s|RUNTIME_PASSWORD|$RUNTIME|; s|^TOTP_ENCRYPTION_KEY=.*|TOTP_ENCRYPTION_KEY=$KEY|" .env.api
   unset OWNER RUNTIME KEY
   exit
   ```
   S'il a tourné deux fois avant le premier démarrage, recopiez le mot de passe de `.env` dans `.env.admin` :
   ```bash
   sudo -i
   cd /opt/insurance-agency
   OWNER=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
   sed -i "s|^MIGRATION_DATABASE_URL=.*|MIGRATION_DATABASE_URL=postgresql://agency_owner:$OWNER@db:5432/agency|" .env.admin
   unset OWNER; exit
   ```
   Le reste (adresse, coordonnées de l'agence) se règle à la main :
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
   - Cartes des compagnies après la connexion (facultatif) : `sudo mkdir /opt/insurance-agency/agency/insurers`,
     copiez-y `insurers.json` et ses images (README « A new agency », étape 4 : logos fournis par les
     compagnies avec leur accord, photos sous licence), puis
     `INSURER_BRANDING_FILE=/data/agency/insurers/insurers.json`. Sans ce fichier, chaque carte montre le
     nom de la compagnie.
4. Relancez `sudo ./install.sh` : il charge les images, prépare la base de données et démarre
   l'application. À la fin : « Version … installée ».

En cas de réglage refusé, l'application ne démarre pas et dit lequel :
`sudo docker compose -f /opt/insurance-agency/compose.yml logs api --tail 20`.

## 6. Le premier administrateur et le catalogue

Le dossier `/opt/insurance-agency` n'est lisible que par root : les commandes donnent son chemin complet.

```bash
sudo docker compose -f /opt/insurance-agency/compose.yml run --rm -it tools node scripts/create-admin.js
sudo docker compose -f /opt/insurance-agency/compose.yml run --rm -it tools node scripts/confirm-reference.js
```

Le mot de passe se tape sans s'afficher. À la première connexion, l'administrateur active la connexion en
deux étapes (Google Authenticator, Microsoft Authenticator…), puis crée les comptes des employés dans
« Utilisateurs ».

## 7. Le cadenas HTTPS sur chaque PC

Le serveur a sa propre autorité de certification. Sa partie publique s'installe une fois par PC :

```bash
sudo /opt/insurance-agency/export-root-ca.sh
```

Il crée `/opt/insurance-agency/insurance-agency-autorite-racine.crt` et affiche son **empreinte SHA-256**. Pour le
récupérer depuis le PC admin, copiez-le d'abord dans votre dossier (le dossier d'installation est réservé à root) :

```bash
sudo cp /opt/insurance-agency/insurance-agency-autorite-racine.crt ~/ && sudo chown "$USER" ~/insurance-agency-autorite-racine.crt
```

Sur chaque PC, dans PowerShell **en administrateur** (la fenêtre de Windows n'affiche que l'empreinte SHA-1,
d'où la commande pour la SHA-256) :

```powershell
cd $HOME\Downloads
scp <utilisateur>@192.168.50.10:~/insurance-agency-autorite-racine.crt .      # ou depuis une clé USB
$c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 "$PWD\insurance-agency-autorite-racine.crt"
[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($c.RawData))
```

**Seulement si l'empreinte est celle du serveur** (mêmes chiffres, tirets au lieu de deux-points) :

```powershell
Import-Certificate -FilePath "$PWD\insurance-agency-autorite-racine.crt" -CertStoreLocation Cert:\LocalMachine\Root
```

(Ou à la souris : double-clic sur le fichier, « Installer le certificat… », **Ordinateur local**, magasin
**Autorités de certification racines de confiance**.) Pour un essai à la main avec `curl.exe` sous
Windows, ajoutez `--ssl-no-revoke` : une autorité locale ne publie pas de liste de révocation (les
navigateurs n'en ont pas besoin).

La clé privée ne quitte jamais le serveur (volume `insurance-agency-proxy-data`, dans les sauvegardes). Le site
impose HTTPS (HSTS) : installez le certificat **avant** d'ouvrir l'application sur un PC.

## 8. Vérifier que tout fonctionne

Sur un PC du bureau :

1. `https://insurance.internal` s'ouvre avec le cadenas, le logo de l'agence sur la page de connexion ;
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
sudo -i                                       # le dossier est réservé à root
cd /opt/insurance-agency
docker compose ps                             # état des services
docker compose logs api --tail 50             # journal de l'application
docker compose restart api                    # redémarrer l'application
docker compose stop && docker compose up --detach --wait
docker stats --no-stream                      # mémoire utilisée maintenant
exit
```

**Ne lancez jamais `docker compose down -v`** : `-v` efface les volumes, donc la base de données et les
documents.

Mises à jour d'Ubuntu, une fois par mois avec Internet : `sudo apt update && sudo apt full-upgrade -y`,
puis `sudo reboot` en dehors des heures de travail.

## 12. Installation d'essai sur le serveur de test (développeur)

Avant le mini-PC, l'installation est essayée sur un **serveur de test temporaire** : un portable Dell
sous Ubuntu Server 26.04.1 LTS (nom `agency-server`, adresse `192.168.11.126`, voir network.md). Ce
n'est **pas** un serveur de production : il prouve les étapes de ce guide, pas la capacité. Données
**synthétiques uniquement**, jamais de vrais clients.

L'exercice de restauration automatique sur le PC Windows (`deployment/rehearsal/run-drill.ps1`) est un
autre test : il ne remplace pas cet essai, et cet essai ne le remplace pas (docs/testing.md).

### Les limites du Dell

| | Dell (test) | Mini-PC (production, §0) |
|---|---|---|
| Processeur | Pentium T4500, 2 cœurs (2009) | 4 cœurs ou plus |
| Mémoire | 3,3 Gio (+ 3,8 Gio d'échange sur le disque) | 16 Go |
| Disque | 465,8 Go, disque mécanique | SSD |
| TPM, chiffrement du disque | Non prévu pour ce test | Oui |

Le fichier compose limite la mémoire de chaque service : base 2 Go, API 3 Go, proxy 256 Mo, soit
5,25 Go au plus. Ce sont des **plafonds**, pas de la mémoire réservée : les services démarrent, mais si
la base et la lecture des scans grossissent ensemble, le Dell passe sur l'échange (très lent sur un
disque mécanique) ou Linux arrête un service faute de mémoire. **On ne baisse pas ces limites pour le
Dell** : la production garde les siennes. On mesure plutôt la mémoire pendant l'essai.

### Avant d'installer : vérifier le Dell (rien n'est modifié)

```bash
grep -o -w 'sse4_2\|popcnt\|avx' /proc/cpuinfo | sort -u   # instructions du processeur
free -h                                                    # mémoire et échange
df -h /opt /var/lib/docker                                 # place libre
docker version && docker compose version
timedatectl                                                # heure synchronisée, Africa/Casablanca
```

Le T4500 n'a ni `sse4_2`, ni `popcnt`, ni `avx` : si la première commande n'affiche rien, des programmes
récents des images (Node.js, PostgreSQL, lecture des scans) peuvent refuser de démarrer. C'est à
constater pendant l'essai, pas à supposer : notez le message exact. Le responsable approuve la suite
au vu de ces résultats.

### Déroulement

1. Sur le PC Windows : `npm run check` entièrement vert, puis la version
   (`powershell -File deployment/production/release.ps1`), construite depuis du code validé.
2. Copiez le dossier de la version sur le Dell, dans `/opt/agency-stack/` (dossier de préparation ; le
   programme d'installation crée ensuite `/opt/insurance-agency` lui-même, comme au §5).
3. Choisissez le PC admin (`ADMIN_IP`) **avant** le pare-feu : après `firewall.sh`, seul ce PC se
   connecte en SSH.
4. Ubuntu et Docker sont déjà installés (§2 fait) : suivez les §3 à §8 avec `LAN_IP=192.168.11.126` et
   l'adresse `insurance.internal` (`APP_HOST`, `APP_ORIGIN=https://insurance.internal`).
5. Sur un autre PC du réseau : fichier `hosts` avec `192.168.11.126 insurance.internal`, certificat
   racine installé (§7), le cadenas, connexion d'un agent.
6. Pare-feu, depuis ce PC : 443 ouvert ; 22 fermé (sauf depuis le PC admin) ; 5432 fermé (§4).
7. Le test de fumée automatique, depuis le PC du développeur, avec un compte agent qui s'est déjà
   connecté une fois dans le navigateur (un nouveau compte change d'abord son mot de passe provisoire) :
   ```powershell
   $env:PRODUCTION_URL = 'https://insurance.internal'
   $env:SMOKE_USERNAME = '<un compte agent>'
   $env:SMOKE_PASSWORD = Read-Host 'Mot de passe'
   npm run test:production
   Remove-Item Env:SMOKE_PASSWORD
   ```
   Il vérifie HTTPS, les en-têtes de sécurité, qu'aucune requête ne sort du serveur, la connexion d'un
   agent et une liste lue dans la base. Ajoutez `$env:SMOKE_RESOLVE = 'insurance.internal:192.168.11.126'`
   si le fichier `hosts` de ce PC n'a pas encore le nom ; jamais `SMOKE_IGNORE_TLS` ici.
8. Sauvegarde et restauration avec des données synthétiques et un disque USB (backup-restore.md §6) :
   un client créé avant l'heure choisie revient, un client créé après disparaît.
9. La mémoire : `sudo docker stats --no-stream` et `free -h` pendant un scan (une **image**, pour la
   lecture des caractères), puis le plus haut atteint par chaque service depuis son démarrage :
   ```bash
   for c in api db proxy; do
     id=$(sudo docker inspect -f '{{.Id}}' insurance-agency-$c-1)
     printf '%-6s pic : ' $c; numfmt --to=iec < /sys/fs/cgroup/system.slice/docker-$id.scope/memory.peak
   done
   ```
10. Notez les résultats et les limites (dans docs/roadmap.md), puis refaites l'installation sur le
    mini-PC.

### Ce que l'essai prouve, et ce qu'il ne prouve pas

| Testable sur le Dell | Demande une machine plus puissante | À refaire sur le mini-PC |
|---|---|---|
| Copie de la version, `install.sh`, réglages, migrations ; HTTPS avec `insurance.internal` et le certificat sur un PC ; pare-feu vu d'un autre PC ; connexion, saisie, impression d'un reçu ; sauvegarde et restauration synthétiques ; le test de fumée | Plusieurs employés en même temps ; la lecture des scans en charge ; les temps de réponse réels | Tout le guide, plus le chiffrement du disque (TPM), l'onduleur, les deux disques échangés et la durée d'une restauration (objectif : le jour même, environ 4 h) |
