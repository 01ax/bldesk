import type { ServerTemplate } from './serverTemplates'
import { TEMPLATE_KIND } from './serverTemplates'
import type { FwRule } from './firewallMatrix'

/**
 * Starter library: real, working cloud-init for the things people actually
 * build on BinaryLane, shipped read-only. "Duplicate" turns one into an
 * editable template of your own. Every starter ends its firewall with an
 * explicit drop — BinaryLane's firewall is first-match with no implicit deny.
 *
 * Anything Ansible would do on a fresh box can be done here at first boot;
 * the CIS baseline is the one to start from when the box faces the internet.
 */

const ANY = ['0.0.0.0/0', '::/0']

const rule = (action: 'accept' | 'drop', protocol: 'tcp' | 'udp' | 'icmp' | 'all', ports: string[] | null, description: string, sources = ANY): FwRule => ({
  action,
  protocol,
  destination_ports: ports,
  source_addresses: sources,
  destination_addresses: ANY,
  description
})

const SSH_FROM = rule('accept', 'tcp', ['{{ssh_port}}'], 'SSH from admin networks', ['{{admin_cidr}}'])
const PING = rule('accept', 'icmp', null, 'ICMP')
const DROP_ALL = rule('drop', 'all', null, 'Drop everything else (first-match, no implicit deny)')

const ADMIN_VARS = [
  { name: 'admin_cidr', label: 'Admin network', description: 'CIDR allowed to reach SSH. Your office or home range, or 0.0.0.0/0 to allow anywhere.', default: '0.0.0.0/0', required: true },
  { name: 'ssh_port', label: 'SSH port', default: '22', required: true },
  { name: 'timezone', label: 'Timezone', default: 'Australia/Brisbane', required: true }
]

const BASELINE_CLOUD_INIT = `#cloud-config
# BLDesk starter: Ubuntu baseline
# Patched, time-synced, fail2ban in front of SSH, unattended security updates.
hostname: {{hostname}}
timezone: {{timezone}}
package_update: true
package_upgrade: true
packages:
  - unattended-upgrades
  - fail2ban
  - ufw
  - chrony
  - htop
  - curl
write_files:
  - path: /etc/apt/apt.conf.d/52bldesk-unattended
    content: |
      APT::Periodic::Update-Package-Lists "1";
      APT::Periodic::Unattended-Upgrade "1";
      APT::Periodic::AutocleanInterval "7";
      Unattended-Upgrade::Remove-Unused-Dependencies "true";
      Unattended-Upgrade::Automatic-Reboot "false";
  - path: /etc/fail2ban/jail.d/sshd.local
    content: |
      [sshd]
      enabled = true
      port = {{ssh_port}}
      maxretry = 5
      findtime = 10m
      bantime = 1h
  - path: /etc/ssh/sshd_config.d/10-bldesk.conf
    content: |
      Port {{ssh_port}}
      PasswordAuthentication no
      PermitRootLogin prohibit-password
      X11Forwarding no
runcmd:
  - systemctl restart ssh
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow {{ssh_port}}/tcp
  - ufw --force enable
  - systemctl enable --now fail2ban
final_message: "BLDesk baseline ready after $UPTIME seconds"
`

const CIS_CLOUD_INIT = `#cloud-config
# BLDesk starter: CIS-hardened Ubuntu 24.04
# Follows the CIS Ubuntu Linux 24.04 Benchmark Level 1 (Server) controls that
# make sense on a single cloud VM. Section numbers reference that benchmark.
# It creates a sudo admin user from the SSH key BinaryLane installed for root,
# then locks root out of SSH — log in as {{admin_user}} afterwards.
hostname: {{hostname}}
timezone: {{timezone}}
package_update: true
package_upgrade: true
packages:
  - unattended-upgrades
  - fail2ban
  - ufw
  - chrony
  - auditd
  - audispd-plugins
  - aide
  - aide-common
  - libpam-pwquality
  - apparmor
  - apparmor-utils
  - rsyslog
  - sudo
users:
  - default
  - name: {{admin_user}}
    groups: [sudo, adm]
    shell: /bin/bash
    sudo: "ALL=(ALL:ALL) ALL"
    lock_passwd: true
write_files:
  # 1.1 Filesystem: disable unused kernel modules
  - path: /etc/modprobe.d/cis-fs.conf
    content: |
      install cramfs /bin/false
      install freevxfs /bin/false
      install hfs /bin/false
      install hfsplus /bin/false
      install jffs2 /bin/false
      install squashfs /bin/false
      install udf /bin/false
      install usb-storage /bin/false
      blacklist cramfs
      blacklist freevxfs
      blacklist hfs
      blacklist hfsplus
      blacklist jffs2
      blacklist squashfs
      blacklist udf
      blacklist usb-storage
  # 3.1 Network: disable uncommon protocols
  - path: /etc/modprobe.d/cis-net.conf
    content: |
      install dccp /bin/false
      install sctp /bin/false
      install rds /bin/false
      install tipc /bin/false
  # 3.3 Network kernel parameters
  - path: /etc/sysctl.d/60-cis.conf
    content: |
      net.ipv4.ip_forward = 0
      net.ipv4.conf.all.send_redirects = 0
      net.ipv4.conf.default.send_redirects = 0
      net.ipv4.conf.all.accept_source_route = 0
      net.ipv4.conf.default.accept_source_route = 0
      net.ipv6.conf.all.accept_source_route = 0
      net.ipv6.conf.default.accept_source_route = 0
      net.ipv4.conf.all.accept_redirects = 0
      net.ipv4.conf.default.accept_redirects = 0
      net.ipv6.conf.all.accept_redirects = 0
      net.ipv6.conf.default.accept_redirects = 0
      net.ipv4.conf.all.secure_redirects = 0
      net.ipv4.conf.default.secure_redirects = 0
      net.ipv4.conf.all.log_martians = 1
      net.ipv4.conf.default.log_martians = 1
      net.ipv4.icmp_echo_ignore_broadcasts = 1
      net.ipv4.icmp_ignore_bogus_error_responses = 1
      net.ipv4.conf.all.rp_filter = 1
      net.ipv4.conf.default.rp_filter = 1
      net.ipv4.tcp_syncookies = 1
      net.ipv6.conf.all.accept_ra = 0
      net.ipv6.conf.default.accept_ra = 0
      # 1.5 Process hardening
      kernel.randomize_va_space = 2
      kernel.yama.ptrace_scope = 1
      fs.suid_dumpable = 0
  - path: /etc/security/limits.d/cis-core.conf
    content: |
      * hard core 0
  - path: /etc/systemd/coredump.conf.d/cis.conf
    content: |
      [Coredump]
      Storage=none
      ProcessSizeMax=0
  # 4.1 Job scheduling: restrict cron/at to root
  - path: /etc/cron.allow
    permissions: "0640"
    content: |
      root
  - path: /etc/at.allow
    permissions: "0640"
    content: |
      root
  # 4.2 SSH server (CIS 5.1)
  - path: /etc/ssh/sshd_config.d/00-cis.conf
    content: |
      Port {{ssh_port}}
      Protocol 2
      LogLevel VERBOSE
      PermitRootLogin no
      PasswordAuthentication no
      PermitEmptyPasswords no
      PubkeyAuthentication yes
      ChallengeResponseAuthentication no
      KbdInteractiveAuthentication no
      UsePAM yes
      X11Forwarding no
      AllowTcpForwarding no
      AllowAgentForwarding no
      PermitUserEnvironment no
      IgnoreRhosts yes
      HostbasedAuthentication no
      MaxAuthTries 4
      MaxSessions 10
      MaxStartups 10:30:60
      LoginGraceTime 60
      ClientAliveInterval 300
      ClientAliveCountMax 3
      Banner /etc/issue.net
      Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr
      MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-sha2-512,hmac-sha2-256
      KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512,diffie-hellman-group-exchange-sha256
      AllowUsers {{admin_user}}
  # 1.7 Warning banners (no OS details)
  - path: /etc/issue.net
    content: |
      Authorized use only. Activity is monitored and logged.
  - path: /etc/issue
    content: |
      Authorized use only. Activity is monitored and logged.
  - path: /etc/motd
    content: ""
  # 5.3 PAM password quality (for sudo password prompts and any future local accounts)
  - path: /etc/security/pwquality.conf.d/50-cis.conf
    content: |
      minlen = 14
      minclass = 4
      maxrepeat = 3
      dictcheck = 1
  - path: /etc/security/faillock.conf
    content: |
      deny = 5
      unlock_time = 900
      fail_interval = 900
  # 5.4 Shell timeout + umask
  - path: /etc/profile.d/cis-shell.sh
    content: |
      readonly TMOUT=900 ; export TMOUT
      umask 027
  # 5.2 sudo: use pty, log, require password re-auth
  - path: /etc/sudoers.d/cis
    permissions: "0440"
    content: |
      Defaults use_pty
      Defaults logfile="/var/log/sudo.log"
      Defaults timestamp_timeout=15
  # 6.2 auditd rules (CIS 6.2.3.x, Level 2 rules trimmed to what a VM needs)
  - path: /etc/audit/rules.d/50-cis.rules
    content: |
      -D
      -b 8192
      -f 1
      -w /etc/sudoers -p wa -k scope
      -w /etc/sudoers.d -p wa -k scope
      -w /var/log/sudo.log -p wa -k sudo_log_file
      -a always,exit -F arch=b64 -S adjtimex,settimeofday,clock_settime -k time-change
      -w /etc/localtime -p wa -k time-change
      -w /etc/group -p wa -k identity
      -w /etc/passwd -p wa -k identity
      -w /etc/gshadow -p wa -k identity
      -w /etc/shadow -p wa -k identity
      -w /etc/security/opasswd -p wa -k identity
      -a always,exit -F arch=b64 -S sethostname,setdomainname -k system-locale
      -w /etc/issue -p wa -k system-locale
      -w /etc/issue.net -p wa -k system-locale
      -w /etc/hosts -p wa -k system-locale
      -w /etc/netplan -p wa -k system-locale
      -w /etc/apparmor -p wa -k MAC-policy
      -w /etc/apparmor.d -p wa -k MAC-policy
      -w /var/log/faillog -p wa -k logins
      -w /var/log/lastlog -p wa -k logins
      -w /var/run/utmp -p wa -k session
      -w /var/log/wtmp -p wa -k session
      -w /var/log/btmp -p wa -k session
      -a always,exit -F arch=b64 -S chmod,fchmod,fchmodat,chown,fchown,fchownat,lchown,setxattr,lsetxattr,fsetxattr,removexattr,lremovexattr,fremovexattr -F auid>=1000 -F auid!=unset -k perm_mod
      -a always,exit -F arch=b64 -S creat,open,openat,truncate,ftruncate -F exit=-EACCES -F auid>=1000 -F auid!=unset -k access
      -a always,exit -F arch=b64 -S creat,open,openat,truncate,ftruncate -F exit=-EPERM -F auid>=1000 -F auid!=unset -k access
      -a always,exit -F arch=b64 -S mount -F auid>=1000 -F auid!=unset -k mounts
      -a always,exit -F arch=b64 -S unlink,unlinkat,rename,renameat -F auid>=1000 -F auid!=unset -k delete
      -w /sbin/insmod -p x -k modules
      -w /sbin/rmmod -p x -k modules
      -w /sbin/modprobe -p x -k modules
      -a always,exit -F arch=b64 -S init_module,delete_module -k modules
      -e 2
  # 6.1 Unattended security updates
  - path: /etc/apt/apt.conf.d/52bldesk-unattended
    content: |
      APT::Periodic::Update-Package-Lists "1";
      APT::Periodic::Unattended-Upgrade "1";
      APT::Periodic::AutocleanInterval "7";
      Unattended-Upgrade::Remove-Unused-Dependencies "true";
      Unattended-Upgrade::Automatic-Reboot "false";
  - path: /etc/fail2ban/jail.d/sshd.local
    content: |
      [sshd]
      enabled = true
      port = {{ssh_port}}
      maxretry = 4
      findtime = 10m
      bantime = 1h
  - path: /etc/cron.daily/aide-check
    permissions: "0755"
    content: |
      #!/bin/sh
      /usr/bin/aide.wrapper --check > /var/log/aide/aide-check.log 2>&1 || logger -p auth.warning "AIDE detected filesystem changes on $(hostname)"
runcmd:
  # Hand root's BinaryLane-installed key to the admin user, then lock root out of SSH.
  - install -d -m 0700 -o {{admin_user}} -g {{admin_user}} /home/{{admin_user}}/.ssh
  - "[ -s /root/.ssh/authorized_keys ] && install -m 0600 -o {{admin_user}} -g {{admin_user}} /root/.ssh/authorized_keys /home/{{admin_user}}/.ssh/authorized_keys || true"
  - passwd -l root
  # 1.4 / 1.5 apply kernel + module settings now
  - sysctl --system
  - "for m in cramfs freevxfs hfs hfsplus jffs2 squashfs udf usb-storage dccp sctp rds tipc; do modprobe -r $m 2>/dev/null || true; done"
  # 1.3 AppArmor enforce everything that has a profile
  - aa-enforce /etc/apparmor.d/* 2>/dev/null || true
  # 2.x Remove services a hardened VM should not run
  - apt-get -y purge avahi-daemon cups rpcbind nfs-common telnet ftp 2>/dev/null || true
  - apt-get -y autoremove
  # 5.1 SSH: drop the stock cloud-init sshd fragment that re-enables password auth, tighten keys
  - rm -f /etc/ssh/sshd_config.d/50-cloud-init.conf
  - chmod 0600 /etc/ssh/ssh_host_*_key
  - chmod 0644 /etc/ssh/ssh_host_*_key.pub
  - chmod 0600 /etc/ssh/sshd_config
  - sshd -t && systemctl restart ssh
  # 3.4 Host firewall (in addition to the BinaryLane firewall on the edge)
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow {{ssh_port}}/tcp
  - ufw logging on
  - ufw --force enable
  # 5.3 Lock down login.defs
  - sed -i 's/^PASS_MAX_DAYS.*/PASS_MAX_DAYS 365/; s/^PASS_MIN_DAYS.*/PASS_MIN_DAYS 1/; s/^PASS_WARN_AGE.*/PASS_WARN_AGE 7/; s/^UMASK.*/UMASK 027/' /etc/login.defs
  - useradd -D -f 30
  # 6.2 auditd + AIDE baseline
  - augenrules --load || true
  - systemctl enable --now auditd
  - systemctl enable --now fail2ban
  - systemctl enable --now rsyslog
  - mkdir -p /var/log/aide
  - "nohup sh -c 'aideinit -y -f >/var/log/aide/aideinit.log 2>&1' >/dev/null 2>&1 &"
  # 7.1 Permissions on the files CIS checks
  - chmod 0644 /etc/passwd /etc/group
  - chmod 0640 /etc/shadow /etc/gshadow
  - chown root:shadow /etc/shadow /etc/gshadow
  - chmod 0600 /boot/grub/grub.cfg 2>/dev/null || true
  - chmod 0750 /home/{{admin_user}}
final_message: "CIS baseline applied after $UPTIME seconds — log in as {{admin_user}} on port {{ssh_port}}; root SSH is disabled"
`

const DOCKER_CLOUD_INIT = `#cloud-config
# BLDesk starter: Docker host
# Docker Engine + Compose from Docker's own apt repo, log rotation, a compose
# directory ready to use, and the deploy user in the docker group.
hostname: {{hostname}}
timezone: {{timezone}}
package_update: true
package_upgrade: true
packages:
  - ca-certificates
  - curl
  - gnupg
  - fail2ban
  - ufw
  - unattended-upgrades
users:
  - default
  - name: {{deploy_user}}
    groups: [sudo, docker]
    shell: /bin/bash
    sudo: "ALL=(ALL:ALL) NOPASSWD:ALL"
    lock_passwd: true
groups:
  - docker
write_files:
  - path: /etc/docker/daemon.json
    content: |
      {
        "log-driver": "json-file",
        "log-opts": { "max-size": "20m", "max-file": "5" },
        "live-restore": true,
        "default-address-pools": [ { "base": "172.20.0.0/16", "size": 24 } ]
      }
  - path: /etc/fail2ban/jail.d/sshd.local
    content: |
      [sshd]
      enabled = true
      maxretry = 5
      bantime = 1h
  - path: /opt/compose/README.md
    content: |
      Put each stack in its own directory under /opt/compose and run
      docker compose up -d from there. Docker is configured with log
      rotation and live-restore so the daemon can restart without stopping
      containers.
runcmd:
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list'
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  - systemctl enable --now docker
  - install -d -m 0700 -o {{deploy_user}} -g {{deploy_user}} /home/{{deploy_user}}/.ssh
  - "[ -s /root/.ssh/authorized_keys ] && install -m 0600 -o {{deploy_user}} -g {{deploy_user}} /root/.ssh/authorized_keys /home/{{deploy_user}}/.ssh/authorized_keys || true"
  - chown -R {{deploy_user}}:{{deploy_user}} /opt/compose
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw --force enable
  - systemctl enable --now fail2ban
final_message: "Docker host ready after $UPTIME seconds — ssh {{deploy_user}}@{{hostname}}"
`

const WORDPRESS_CLOUD_INIT = `#cloud-config
# BLDesk starter: WordPress on nginx + PHP-FPM + MariaDB
# Installs the stack, creates the database, downloads WordPress with WP-CLI
# and requests a Let's Encrypt certificate once DNS for {{site_domain}}
# points at this server (run "certbot --nginx -d {{site_domain}}" later if it
# does not yet).
hostname: {{hostname}}
timezone: {{timezone}}
package_update: true
package_upgrade: true
packages:
  - nginx
  - mariadb-server
  - php-fpm
  - php-mysql
  - php-curl
  - php-gd
  - php-intl
  - php-mbstring
  - php-soap
  - php-xml
  - php-xmlrpc
  - php-zip
  - php-imagick
  - certbot
  - python3-certbot-nginx
  - fail2ban
  - ufw
  - unattended-upgrades
  - curl
write_files:
  - path: /etc/nginx/sites-available/wordpress
    content: |
      server {
          listen 80;
          listen [::]:80;
          server_name {{site_domain}};
          root /var/www/wordpress;
          index index.php;
          client_max_body_size 64m;
          location / { try_files $uri $uri/ /index.php?$args; }
          location ~ \\.php$ {
              include snippets/fastcgi-php.conf;
              fastcgi_pass unix:/run/php/php-fpm.sock;
          }
          location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ { expires 30d; access_log off; }
          location ~ /\\.ht { deny all; }
          location = /xmlrpc.php { deny all; }
      }
  - path: /etc/fail2ban/jail.d/sshd.local
    content: |
      [sshd]
      enabled = true
      maxretry = 5
      bantime = 1h
runcmd:
  - systemctl enable --now mariadb
  - mysql -e "CREATE DATABASE wordpress DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  - mysql -e "CREATE USER 'wordpress'@'localhost' IDENTIFIED BY '{{db_password}}';"
  - mysql -e "GRANT ALL PRIVILEGES ON wordpress.* TO 'wordpress'@'localhost'; FLUSH PRIVILEGES;"
  - curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp
  - chmod +x /usr/local/bin/wp
  - mkdir -p /var/www/wordpress
  - chown www-data:www-data /var/www/wordpress
  - sudo -u www-data wp core download --path=/var/www/wordpress
  - sudo -u www-data wp config create --path=/var/www/wordpress --dbname=wordpress --dbuser=wordpress --dbpass='{{db_password}}' --dbhost=localhost
  - sudo -u www-data wp core install --path=/var/www/wordpress --url="https://{{site_domain}}" --title="{{site_title}}" --admin_user=admin --admin_email="{{admin_email}}" --skip-email
  - ln -sf /etc/nginx/sites-available/wordpress /etc/nginx/sites-enabled/wordpress
  - rm -f /etc/nginx/sites-enabled/default
  - nginx -t && systemctl reload nginx
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw --force enable
  - systemctl enable --now fail2ban
  - "certbot --nginx --non-interactive --agree-tos --redirect -m {{admin_email}} -d {{site_domain}} || echo 'certbot skipped: point DNS at this server, then run certbot --nginx -d {{site_domain}}'"
  - "echo \\"WordPress admin password: $(sudo -u www-data wp user update admin --user_pass=$(openssl rand -base64 18) --path=/var/www/wordpress --porcelain 2>/dev/null || true)\\" > /root/wordpress-admin.txt"
final_message: "WordPress ready after $UPTIME seconds — https://{{site_domain}}/wp-admin (set the admin password with: wp user update admin --user_pass=... --path=/var/www/wordpress)"
`

const WIREGUARD_CLOUD_INIT = `#cloud-config
# BLDesk starter: WireGuard bastion
# A jump host that is only reachable over WireGuard. SSH stays open on the
# public side until you have connected once; then remove the SSH rule from
# the BinaryLane firewall. The first peer's config is written to
# /root/wg-clients/{{first_client}}.conf — copy it out with scp.
hostname: {{hostname}}
timezone: {{timezone}}
package_update: true
package_upgrade: true
packages:
  - wireguard
  - qrencode
  - fail2ban
  - ufw
  - unattended-upgrades
write_files:
  - path: /etc/sysctl.d/99-wireguard.conf
    content: |
      net.ipv4.ip_forward = 1
      net.ipv6.conf.all.forwarding = 1
  - path: /usr/local/sbin/wg-add-client
    permissions: "0755"
    content: |
      #!/bin/bash
      # usage: wg-add-client <name>  — adds a peer and writes /root/wg-clients/<name>.conf
      set -euo pipefail
      name="$1"; dir=/root/wg-clients; mkdir -p "$dir"; umask 077
      n=$(( $(ls "$dir"/*.conf 2>/dev/null | wc -l) + 2 ))
      priv=$(wg genkey); pub=$(echo "$priv" | wg pubkey); psk=$(wg genpsk)
      server_pub=$(wg pubkey < /etc/wireguard/server.key)
      endpoint=$(curl -4s https://ifconfig.me || hostname -I | awk '{print $1}')
      base={{wg_subnet}}; prefix=$(echo "$base" | cut -d. -f1-3)
      wg set wg0 peer "$pub" preshared-key <(echo "$psk") allowed-ips "$prefix.$n/32"
      wg-quick save wg0
      cat > "$dir/$name.conf" <<EOF
      [Interface]
      PrivateKey = $priv
      Address = $prefix.$n/24
      DNS = 1.1.1.1

      [Peer]
      PublicKey = $server_pub
      PresharedKey = $psk
      Endpoint = $endpoint:{{wg_port}}
      AllowedIPs = 0.0.0.0/0, ::/0
      PersistentKeepalive = 25
      EOF
      echo "wrote $dir/$name.conf"; qrencode -t ansiutf8 < "$dir/$name.conf"
  - path: /etc/fail2ban/jail.d/sshd.local
    content: |
      [sshd]
      enabled = true
      maxretry = 5
      bantime = 1h
runcmd:
  - sysctl --system
  - umask 077 && wg genkey > /etc/wireguard/server.key
  - "IFACE=$(ip route show default | awk '{print $5}' | head -1); PREFIX=$(echo {{wg_subnet}} | cut -d. -f1-3); printf '[Interface]\\nAddress = %s.1/24\\nListenPort = {{wg_port}}\\nPrivateKey = %s\\nPostUp = ufw route allow in on wg0 out on %s; iptables -t nat -I POSTROUTING -o %s -j MASQUERADE\\nPreDown = ufw route delete allow in on wg0 out on %s; iptables -t nat -D POSTROUTING -o %s -j MASQUERADE\\n' \\"$PREFIX\\" \\"$(cat /etc/wireguard/server.key)\\" \\"$IFACE\\" \\"$IFACE\\" \\"$IFACE\\" \\"$IFACE\\" > /etc/wireguard/wg0.conf"
  - chmod 600 /etc/wireguard/wg0.conf
  - systemctl enable --now wg-quick@wg0
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw allow {{wg_port}}/udp
  - ufw --force enable
  - systemctl enable --now fail2ban
  - wg-add-client {{first_client}}
final_message: "WireGuard bastion ready after $UPTIME seconds — scp root@{{hostname}}:/root/wg-clients/{{first_client}}.conf ."
`

const K3S_CLOUD_INIT = `#cloud-config
# BLDesk starter: k3s node
# Role "server" starts a control plane (leave k3s_url blank); role "agent"
# joins the cluster at k3s_url with k3s_token. Put the nodes in one VPC and
# they talk over the private network.
hostname: {{hostname}}
timezone: {{timezone}}
package_update: true
package_upgrade: true
packages:
  - curl
  - open-iscsi
  - nfs-common
  - fail2ban
  - ufw
  - unattended-upgrades
write_files:
  - path: /etc/fail2ban/jail.d/sshd.local
    content: |
      [sshd]
      enabled = true
      maxretry = 5
      bantime = 1h
runcmd:
  - mkdir -p /etc/rancher/k3s
  - "PRIV=$(ip -4 -o addr show scope global | awk '/ 10[.]/{print $4}' | cut -d/ -f1 | head -1); printf 'node-name: {{hostname}}\\n' > /etc/rancher/k3s/config.yaml; [ -n \\"$PRIV\\" ] && printf 'node-ip: %s\\nflannel-iface: %s\\n' \\"$PRIV\\" \\"$(ip -4 -o addr show scope global | awk '/ 10[.]/{print $2}' | head -1)\\" >> /etc/rancher/k3s/config.yaml || true"
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw allow from 10.0.0.0/8
  - ufw allow 6443/tcp
  - ufw --force enable
  - systemctl enable --now fail2ban
  - "if [ '{{k3s_role}}' = 'server' ]; then curl -sfL https://get.k3s.io | K3S_TOKEN='{{k3s_token}}' sh -s - server --write-kubeconfig-mode 644; else curl -sfL https://get.k3s.io | K3S_URL='{{k3s_url}}' K3S_TOKEN='{{k3s_token}}' sh -s - agent; fi"
final_message: "k3s {{k3s_role}} ready after $UPTIME seconds"
`

const POSTGRES_CLOUD_INIT = `#cloud-config
# BLDesk starter: PostgreSQL 16
# From the PGDG repo, tuned for the VM's RAM, listening on the private
# network only, with a database and owner created and nightly pg_dump.
hostname: {{hostname}}
timezone: {{timezone}}
package_update: true
package_upgrade: true
packages:
  - curl
  - ca-certificates
  - gnupg
  - fail2ban
  - ufw
  - unattended-upgrades
write_files:
  - path: /etc/cron.daily/pg-backup
    permissions: "0755"
    content: |
      #!/bin/sh
      set -e
      d=/var/backups/postgresql; mkdir -p "$d"
      sudo -u postgres pg_dump -Fc {{db_name}} > "$d/{{db_name}}-$(date +%F).dump"
      find "$d" -name '*.dump' -mtime +14 -delete
  - path: /etc/fail2ban/jail.d/sshd.local
    content: |
      [sshd]
      enabled = true
      maxretry = 5
      bantime = 1h
runcmd:
  - install -d /usr/share/postgresql-common/pgdg
  - curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  - 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  - apt-get update
  - apt-get install -y postgresql-16 postgresql-contrib-16
  - "MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo); PRIV=$(ip -4 -o addr show scope global | awk '/ 10[.]/{print $4}' | cut -d/ -f1 | head -1); printf \\"listen_addresses = 'localhost%s'\\nshared_buffers = %dMB\\neffective_cache_size = %dMB\\nmaintenance_work_mem = %dMB\\nwork_mem = %dMB\\nwal_compression = on\\nlog_min_duration_statement = 500\\npassword_encryption = scram-sha-256\\n\\" \\"$([ -n \\"$PRIV\\" ] && echo \\",$PRIV\\")\\" $((MEM/4)) $((MEM*3/4)) $((MEM/16)) $((MEM/64)) > /etc/postgresql/16/main/conf.d/bldesk.conf"
  - "echo 'host {{db_name}} {{db_user}} {{allowed_cidr}} scram-sha-256' >> /etc/postgresql/16/main/pg_hba.conf"
  - systemctl restart postgresql
  - sudo -u postgres psql -c "CREATE ROLE \\"{{db_user}}\\" LOGIN PASSWORD '{{db_password}}';"
  - sudo -u postgres psql -c "CREATE DATABASE \\"{{db_name}}\\" OWNER \\"{{db_user}}\\";"
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw allow from {{allowed_cidr}} to any port 5432 proto tcp
  - ufw --force enable
  - systemctl enable --now fail2ban
final_message: "PostgreSQL 16 ready after $UPTIME seconds — {{db_name}} owned by {{db_user}}, reachable from {{allowed_cidr}}"
`

const at = '2026-09-03T00:00:00.000Z'
const TZ = ADMIN_VARS[2]

export const STARTER_TEMPLATES: Array<{ slug: string; template: ServerTemplate }> = [
  {
    slug: 'starter-ubuntu-baseline',
    template: {
      kind: TEMPLATE_KIND,
      name: 'Ubuntu baseline',
      description: 'Patched Ubuntu 24.04 with unattended security updates, fail2ban, ufw and chrony. The plain starting point.',
      labels: ['starter', 'baseline'],
      created_at: at,
      variables: ADMIN_VARS,
      spec: {
        region: 'syd',
        size: 'std-1vcpu',
        image: 'ubuntu-24.04',
        options: { ipv4_addresses: 1, daily_backups: 0, weekly_backups: 0, monthly_backups: 0, offsite_backups: false },
        firewallRules: [SSH_FROM, PING, DROP_ALL],
        tags: ['baseline'],
        cloudInit: BASELINE_CLOUD_INIT
      }
    }
  },
  {
    slug: 'starter-cis-hardened-ubuntu',
    template: {
      kind: TEMPLATE_KIND,
      name: 'CIS-hardened Ubuntu 24.04',
      description: 'CIS Benchmark Level 1 (Server) controls applied at first boot: sudo admin user, root locked out of SSH, hardened sshd, kernel and module lockdown, auditd, AIDE, PAM password policy, banners, ufw. Start here for anything internet-facing.',
      labels: ['starter', 'hardened', 'cis'],
      created_at: at,
      variables: [
        { name: 'admin_user', label: 'Admin user', description: 'Sudo user created from the SSH key BinaryLane installs for root. Root SSH is then disabled.', default: 'admin', required: true },
        ...ADMIN_VARS
      ],
      spec: {
        region: 'syd',
        size: 'std-1vcpu',
        image: 'ubuntu-24.04',
        options: { ipv4_addresses: 1, daily_backups: 2, weekly_backups: 0, monthly_backups: 0, offsite_backups: false },
        firewallRules: [SSH_FROM, PING, DROP_ALL],
        tags: ['hardened'],
        cloudInit: CIS_CLOUD_INIT
      }
    }
  },
  {
    slug: 'starter-docker-host',
    template: {
      kind: TEMPLATE_KIND,
      name: 'Docker host',
      description: 'Docker Engine and Compose from the Docker repo, log rotation, live-restore, a deploy user in the docker group and /opt/compose ready for stacks.',
      labels: ['starter', 'containers'],
      created_at: at,
      variables: [{ name: 'deploy_user', label: 'Deploy user', default: 'deploy', required: true }, TZ],
      spec: {
        region: 'syd',
        size: 'std-2vcpu',
        image: 'ubuntu-24.04',
        options: { ipv4_addresses: 1, daily_backups: 2, weekly_backups: 0, monthly_backups: 0, offsite_backups: false },
        firewallRules: [rule('accept', 'tcp', ['22'], 'SSH'), rule('accept', 'tcp', ['80', '443'], 'Web'), PING, DROP_ALL],
        tags: ['docker'],
        cloudInit: DOCKER_CLOUD_INIT
      }
    }
  },
  {
    slug: 'starter-wordpress',
    template: {
      kind: TEMPLATE_KIND,
      name: 'WordPress (nginx + PHP-FPM + MariaDB)',
      description: 'A complete WordPress install with WP-CLI and a Let’s Encrypt certificate requested at first boot. Point DNS at the server before you create it and HTTPS just works.',
      labels: ['starter', 'web'],
      created_at: at,
      variables: [
        { name: 'site_domain', label: 'Site domain', description: 'The hostname visitors use, e.g. blog.example.com.', required: true },
        { name: 'site_title', label: 'Site title', default: 'My site', required: true },
        { name: 'admin_email', label: 'Admin email', description: 'WordPress admin and Let’s Encrypt contact.', required: true },
        { name: 'db_password', label: 'Database password', description: 'For the wordpress database user. Generated per server; never saved in the template.', secret: true, required: true },
        TZ
      ],
      spec: {
        region: 'syd',
        size: 'std-2vcpu',
        image: 'ubuntu-24.04',
        options: { ipv4_addresses: 1, daily_backups: 2, weekly_backups: 1, monthly_backups: 0, offsite_backups: true },
        firewallRules: [rule('accept', 'tcp', ['22'], 'SSH'), rule('accept', 'tcp', ['80', '443'], 'Web'), PING, DROP_ALL],
        tags: ['web', 'wordpress'],
        cloudInit: WORDPRESS_CLOUD_INIT
      }
    }
  },
  {
    slug: 'starter-wireguard-bastion',
    template: {
      kind: TEMPLATE_KIND,
      name: 'WireGuard bastion',
      description: 'A VPN jump host. Generates the server key, writes the first client config with a QR code, and ships a wg-add-client helper for the rest. Remove the SSH rule from the BinaryLane firewall once you are on the VPN.',
      labels: ['starter', 'network', 'hardened'],
      created_at: at,
      variables: [
        { name: 'wg_port', label: 'WireGuard port', default: '51820', required: true },
        { name: 'wg_subnet', label: 'VPN subnet', description: 'Tunnel addresses, /24. The server takes .1.', default: '10.8.0.0/24', required: true },
        { name: 'first_client', label: 'First client name', default: 'laptop', required: true },
        TZ
      ],
      spec: {
        region: 'syd',
        size: 'std-min',
        image: 'ubuntu-24.04',
        options: { ipv4_addresses: 1, daily_backups: 0, weekly_backups: 0, monthly_backups: 0, offsite_backups: false },
        firewallRules: [rule('accept', 'udp', ['{{wg_port}}'], 'WireGuard'), rule('accept', 'tcp', ['22'], 'SSH (remove once on the VPN)'), PING, DROP_ALL],
        tags: ['bastion', 'vpn'],
        cloudInit: WIREGUARD_CLOUD_INIT
      }
    }
  },
  {
    slug: 'starter-k3s-node',
    template: {
      kind: TEMPLATE_KIND,
      name: 'k3s node',
      description: 'A Kubernetes node on k3s. Create the first one as a server, then agents with the server’s private VPC address and token. Nodes talk over the VPC.',
      labels: ['starter', 'containers', 'kubernetes'],
      created_at: at,
      variables: [
        { name: 'k3s_role', label: 'Role', description: '"server" for the control plane, "agent" to join one.', default: 'server', required: true },
        { name: 'k3s_token', label: 'Cluster token', description: 'Shared secret for the cluster. Use the same on every node.', secret: true, required: true },
        { name: 'k3s_url', label: 'Server URL', description: 'Agents only: https://<server private ip>:6443', default: 'https://10.0.0.1:6443', required: false },
        TZ
      ],
      spec: {
        region: 'syd',
        size: 'std-2vcpu',
        image: 'ubuntu-24.04',
        options: { ipv4_addresses: 1, daily_backups: 0, weekly_backups: 0, monthly_backups: 0, offsite_backups: false },
        firewallRules: [rule('accept', 'tcp', ['22'], 'SSH'), rule('accept', 'tcp', ['6443'], 'Kubernetes API'), rule('accept', 'tcp', ['80', '443'], 'Ingress'), rule('accept', 'all', null, 'VPC', ['10.0.0.0/8']), PING, DROP_ALL],
        tags: ['k3s'],
        cloudInit: K3S_CLOUD_INIT
      }
    }
  },
  {
    slug: 'starter-postgresql-16',
    template: {
      kind: TEMPLATE_KIND,
      name: 'PostgreSQL 16',
      description: 'PostgreSQL 16 from PGDG, tuned to the VM’s RAM, listening on the private network, with a database and owner created and a nightly pg_dump kept for 14 days.',
      labels: ['starter', 'database'],
      created_at: at,
      variables: [
        { name: 'db_name', label: 'Database name', default: 'app', required: true },
        { name: 'db_user', label: 'Database owner', default: 'app', required: true },
        { name: 'db_password', label: 'Owner password', secret: true, required: true },
        { name: 'allowed_cidr', label: 'Client network', description: 'Who may connect on 5432. Your VPC range, usually.', default: '10.0.0.0/8', required: true },
        TZ
      ],
      spec: {
        region: 'syd',
        size: 'std-2vcpu',
        image: 'ubuntu-24.04',
        options: { memory: 4096, ipv4_addresses: 1, daily_backups: 2, weekly_backups: 1, monthly_backups: 1, offsite_backups: true },
        firewallRules: [rule('accept', 'tcp', ['22'], 'SSH'), rule('accept', 'tcp', ['5432'], 'PostgreSQL from clients', ['{{allowed_cidr}}']), PING, DROP_ALL],
        tags: ['database', 'postgres'],
        cloudInit: POSTGRES_CLOUD_INIT
      }
    }
  }
]
