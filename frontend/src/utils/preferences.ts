export type Tema = 'claro' | 'escuro';

const CHAVE_TEMA = 'cremepe_tema';

export function getTema(): Tema {
  try {
    return localStorage.getItem(CHAVE_TEMA) === 'escuro' ? 'escuro' : 'claro';
  } catch {
    return 'claro';
  }
}

export function setTema(tema: Tema): void {
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    /* localStorage indisponível */
  }
}
