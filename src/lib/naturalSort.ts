const naturalTextCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
});

export const compareNaturalText = (a: string, b: string): number => {
  return naturalTextCollator.compare(a || '', b || '');
};
