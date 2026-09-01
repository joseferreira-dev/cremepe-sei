import ldap from "ldapjs";
import { env } from "../config/env.js";

export interface LdapUser {
  sAMAccountName: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

export function ldapBind(
  username: string,
  password: string
): Promise<LdapUser | null> {
  return new Promise((resolve) => {
    if (!env.LDAP_URL || !env.LDAP_BASE_DN || !env.LDAP_DOMAIN) {
      console.warn("[LDAP] Configuração LDAP incompleta, pulando autenticação AD.");
      resolve(null);
      return;
    }

    const userPrincipalName = `${username}@${env.LDAP_DOMAIN}`;

    const client = ldap.createClient({
      url: env.LDAP_URL,
      connectTimeout: 5000,
      timeout: 5000,
    });

    const cleanup = () => {
      try { client.destroy(); } catch {}
    };

    client.on("connectError", (err) => {
      console.error("[LDAP] Erro de conexão:", err.message);
      cleanup();
      resolve(null);
    });

    client.on("error", (err) => {
      console.error("[LDAP] Erro:", err.message);
      cleanup();
      resolve(null);
    });

    client.bind(userPrincipalName, password, (bindErr) => {
      if (bindErr) {
        console.warn("[LDAP] Bind falhou para", username, ":", bindErr.message);
        cleanup();
        resolve(null);
        return;
      }

      const searchOpts: ldap.SearchOptions = {
        filter: `(sAMAccountName=${username})`,
        scope: "sub",
        attributes: ["dn", "sAMAccountName", "displayName", "mail", "userPrincipalName"],
      };

      client.search(env.LDAP_BASE_DN, searchOpts, (searchErr, res) => {
        if (searchErr) {
          console.error("[LDAP] Erro na busca:", searchErr.message);
          cleanup();
          resolve(null);
          return;
        }

        let found = false;

        res.on("searchEntry", (entry) => {
          found = true;
          const obj: any = {};
          for (const attr of entry.pojo.attributes) {
            const a = attr as any;
            obj[a.name || a.type] = a.values?.[0];
          }

          const ldapUser: LdapUser = {
            sAMAccountName: obj.sAMAccountName || username,
            displayName: obj.displayName || obj.sAMAccountName || username,
            mail: obj.mail || `${username}@${env.LDAP_DOMAIN}`,
            userPrincipalName: obj.userPrincipalName || userPrincipalName,
          };

          cleanup();
          resolve(ldapUser);
        });

        res.on("error", (err) => {
          console.error("[LDAP] Erro no resultado da busca:", err.message);
          cleanup();
          resolve(null);
        });

        res.on("end", () => {
          if (!found) {
            console.warn("[LDAP] Usuário", username, "não encontrado no AD.");
            cleanup();
            resolve(null);
          }
        });
      });
    });

    setTimeout(() => {
      console.warn("[LDAP] Timeout na conexão para", username);
      cleanup();
      resolve(null);
    }, 7000);
  });
}
