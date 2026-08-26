import {
  PET_CATALOG, createPet, addPetXp, getPetStage,
  getPetAbilityTriggerChance, formatPetBonuses, xpToNextPetLevel,
} from '../pets';

describe('PET_CATALOG', () => {
  test('has 5 pets',                   () => expect(Object.keys(PET_CATALOG)).toHaveLength(5));
  test('each pet has at least 1 stage', () => {
    for (const t of Object.values(PET_CATALOG)) expect(t.stages.length).toBeGreaterThanOrEqual(1);
  });
});

describe('createPet', () => {
  test('creates ash_cat with defaults', () => {
    const pet = createPet('ash_cat')!;
    expect(pet.level).toBe(1);
    expect(pet.xp).toBe(0);
    expect(pet.coinBonus).toBeGreaterThan(0);
    expect(pet.templateId).toBe('ash_cat');
  });
  test('creates unique IDs', () => {
    expect(createPet('ash_cat')?.id).not.toBe(createPet('ash_cat')?.id);
  });
  test('returns null for unknown template', () => expect(createPet('nope')).toBeNull());
});

describe('addPetXp', () => {
  test('increments xp without level change', () => {
    const pet = createPet('ash_cat')!;
    expect(addPetXp(pet, 10).xp).toBe(10);
    expect(addPetXp(pet, 10).level).toBe(1);
  });
  test('levels up when threshold met', () => {
    const pet      = createPet('ash_cat')!;
    const needed   = xpToNextPetLevel(pet);
    const updated  = addPetXp(pet, needed);
    expect(updated.level).toBe(2);
  });
  test('does not level past maxLevel', () => {
    const pet = { ...createPet('ash_cat')!, level: 50, xp: 0 };
    expect(addPetXp(pet, 999_999).level).toBe(50);
  });
  test('evolves to stage 2 at level 10', () => {
    const pet    = { ...createPet('ash_cat')!, level: 9, xp: 0 };
    const needed = xpToNextPetLevel(pet);
    const ev     = addPetXp(pet, needed);
    expect(ev.level).toBe(10);
    expect(ev.name).toBe('Ash Cat');
    expect(ev.coinBonus).toBeGreaterThan(0.05);
  });
  test('does not mutate original', () => {
    const pet = createPet('ash_cat')!;
    addPetXp(pet, 50);
    expect(pet.xp).toBe(0);
  });
});

describe('getPetStage', () => {
  test('stage 1 at level 1',  () => expect(getPetStage('ash_cat', 1)?.name).toBe('Ash Kitten'));
  test('stage 2 at level 10', () => expect(getPetStage('ash_cat', 10)?.name).toBe('Ash Cat'));
  test('stage 3 at level 25', () => expect(getPetStage('ash_cat', 25)?.name).toBe('Ember Cat'));
  test('null for unknown',    () => expect(getPetStage('nope', 1)).toBeNull());
});

describe('getPetAbilityTriggerChance', () => {
  test('void_entity at level 1  -> 10%', () => expect(getPetAbilityTriggerChance(createPet('void_entity')!)).toBe(0.10));
  test('void_entity at level 15 -> 15%', () => expect(getPetAbilityTriggerChance({ ...createPet('void_entity')!, level: 15 })).toBe(0.15));
  test('void_entity at level 30 -> 25%', () => expect(getPetAbilityTriggerChance({ ...createPet('void_entity')!, level: 30 })).toBe(0.25));
  test('ash_cat returns 0',              () => expect(getPetAbilityTriggerChance(createPet('ash_cat')!)).toBe(0));
});

describe('formatPetBonuses', () => {
  test('ash_cat shows coins',      () => expect(formatPetBonuses(createPet('ash_cat')!)).toContain('coins'));
  test('void_entity shows ability',() => expect(formatPetBonuses(createPet('void_entity')!)).toContain('void'));
});
