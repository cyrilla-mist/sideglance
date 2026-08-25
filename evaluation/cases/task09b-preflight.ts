export const task09bPreflightCases = {
  A: {
    id: 'gate-friday-merge', input: 'Nora: just merged the auth rewrite into main\n\nKai: on a friday??\n\nLeo: fearless behavior 💀\n\nNora: wait what\n\nKai: nothing. enjoy your weekend', expectedGate: 'ready', kind: 'friday',
  },
  B: {
    id: 'gate-fearless-behavior', input: 'fearless behavior 💀', expectedGate: 'needs_context', kind: 'isolated',
  },
  C: {
    id: 'gate-sincere-fearless', input: 'fearless behavior', context: 'Mia: I finally spoke up about the issue.\n\nAlex: That was fearless behavior.', expectedGate: 'ready', kind: 'praise',
  },
  D: {
    id: 'developer-readme-update', input: 'Sam: I updated the README with the setup steps and the new environment variable names.\n\nMina: Thanks, I’ll review it this afternoon.', expectedGate: 'ready', kind: 'readme',
  },
} as const;

export type Task09BPreflightCase = typeof task09bPreflightCases[keyof typeof task09bPreflightCases];
