import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("[SEED] Iniciando seed do banco de dados...");

  // Create admin user
  const adminPasswordHash = await bcrypt.hash("admin123", 12);
  await prisma.user.upsert({
    where: { email: "admin@cremepe.org.br" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@cremepe.org.br",
      passwordHash: adminPasswordHash,
      role: "admin",
      authSource: "local",
    },
  });
  console.log("[SEED] Usuário admin criado: admin@cremepe.org.br / admin123");

  // Create default users
  const users = [
    { name: "Ana Paula Ferreira", email: "ana.ferreira@cremepe.org.br", role: "admin" },
    { name: "Carlos Eduardo Silva", email: "carlos.silva@cremepe.org.br", role: "protocolo" },
    { name: "Mariana Costa", email: "mariana.costa@cremepe.org.br", role: "analista" },
    { name: "Roberto Alves", email: "roberto.alves@cremepe.org.br", role: "gestor" },
  ];

  const defaultPassword = await bcrypt.hash("123456", 12);
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        passwordHash: defaultPassword,
        role: u.role,
        authSource: "local",
      },
    });
  }
  console.log("[SEED] Usuários padrão criados (senha: 123456)");

  // Create default tags
  const tags = [
    { name: "Urgente", color: "#EF4444" },
    { name: "Análise Jurídica", color: "#8B5CF6" },
    { name: "Recurso", color: "#F59E0B" },
    { name: "CFM", color: "#29ABE2" },
    { name: "Denúncia", color: "#EF4444" },
    { name: "Ético-Disciplinar", color: "#6366F1" },
    { name: "Registro", color: "#009C60" },
  ];

  for (const t of tags) {
    await prisma.tag.upsert({
      where: { name: t.name },
      update: {},
      create: t,
    });
  }
  console.log("[SEED] Tags padrão criadas");

  console.log("[SEED] Seed concluído com sucesso!");
}

main()
  .catch((e) => {
    console.error("[SEED] Erro:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
