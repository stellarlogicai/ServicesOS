const SOURCE_REPOSITORY = 'C:/Users/merce/Documents/SLAI_Real/Planning';
const SOURCE_ROOT = '01_ServicesOS/Service Checklist';
const SOURCE_VERSION = 'Planning commits 6ad6796 (2026-06-22) and 1272d44 (2026-06-23)';
const IMPORTED_AT = '2026-07-17';

const sourcePath = fileName => `${SOURCE_ROOT}/${fileName}`;

const slug = value => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

function taskGroup(moduleId, area, labels, options = {}) {
  const sourceReferences = moduleSourceReferences(moduleId);
  const entries = labels.map(entry => normalizeTaskEntry(entry, options));
  const partitions = [];

  if (options.separate === true) {
    entries.forEach(entry => partitions.push({ key: slug(entry.label), entries: [entry] }));
  } else {
    entries.forEach(entry => {
      const key = entry.required ? 'required' : 'optional';
      const partition = partitions.find(candidate => candidate.key === key);
      if (partition) partition.entries.push(entry);
      else partitions.push({ key, entries: [entry] });
    });
  }

  return partitions.map((partition, index) => {
    const copy = outcomeCopy(area, partition.entries);
    const single = partition.entries.length === 1 ? partition.entries[0] : null;
    return {
      id: `${moduleId}-${slug(area)}-${partition.key}-${index + 1}`,
      area,
      fixtureOrSurface: fixtureName(area),
      label: copy.label,
      completionCriteria: copy.completionCriteria,
      jobAidSteps: single ? [] : partition.entries.map(entry => ({
        label: entry.label,
        note: entry.note,
        condition: entry.condition,
      })),
      note: single?.note || '',
      condition: single?.condition || '',
      required: partition.entries.every(entry => entry.required),
      completed: false,
      approvedMethodIds: [],
      preferredMethodId: null,
      warnings: [...(options.warnings || [])],
      sourceReferences: [...sourceReferences],
    };
  });
}

const SANITIZING_CONDITION = 'only when explicitly included and an approved compatible product and label-supported contact time are available';

function normalizeTaskEntry(entry, options = {}) {
  const value = typeof entry === 'string' ? { label: entry } : entry;
  const sanitizing = /\b(sanitiz|disinfect)/i.test(value.label);
  const sourceCondition = value.condition || options.condition || '';
  return {
    label: value.label,
    note: value.note || '',
    condition: sanitizing
      ? [sourceCondition, SANITIZING_CONDITION].filter(Boolean).join('; ')
      : sourceCondition,
    required: value.required ?? options.required ?? true,
  };
}

function roomOutcome(moduleId, area, fixtureOrSurface, label, completionCriteria, steps, options = {}) {
  const normalizedSteps = steps.map(step => normalizeTaskEntry(step, options));
  return {
    id: `${moduleId}-${slug(label)}`,
    area,
    fixtureOrSurface,
    label,
    completionCriteria,
    jobAidSteps: normalizedSteps.map(step => ({
      label: step.label,
      note: step.note,
      condition: step.condition,
    })),
    note: options.note || '',
    condition: options.condition || '',
    required: options.required ?? true,
    completed: false,
    approvedMethodIds: [],
    preferredMethodId: null,
    warnings: [...(options.warnings || [])],
    sourceReferences: [...moduleSourceReferences(moduleId)],
  };
}

const MODULE_SOURCE_MAP = [
  ['bathroom-', ['Bathroom Checklist.md']],
  ['kitchen-', ['Kitchen Checklist.md']],
  ['living-room-', ['Living Room Checklist.md']],
  ['bedroom-', ['Bedroom Checklist.md']],
  ['laundry-', ['Laundry Room Checklist.md']],
  ['entryway-', ['Entryway Checklist.md']],
  ['hallway-', ['Hallway Checklist.md']],
  ['office-', ['Office Checklist.md']],
  ['standard-one-time', ['One-Time Cleaning Checklist.md']],
  ['standard-recurring', ['Standard Recurring Cleaning Checklist.md']],
  ['maintenance', ['Maintenance Cleaning Checklist.md']],
  ['deep-service', ['Deep Cleaning Service Checklist.md', 'Initial Deep Clean Checklist.md']],
  ['move-out-service', ['Move-Out Cleaning Checklist.md']],
  ['addon-oven', ['Kitchen Checklist.md']],
  ['addon-fridge', ['Kitchen Checklist.md']],
  ['addon-inside-cabinets', ['Kitchen Checklist.md']],
  ['addon-', ['Initial Deep Clean Checklist.md']],
  ['modifier-pet-home', ['Pet Home Modifier.md']],
];

function moduleSourceReferences(moduleId) {
  const match = MODULE_SOURCE_MAP.find(([prefix]) => moduleId.startsWith(prefix));
  return (match?.[1] || []).map(sourcePath);
}

function fixtureName(area) {
  const segment = String(area).split('/').pop().trim();
  return segment || String(area);
}

function outcomeCopy(area, entries) {
  const fixture = fixtureName(area);
  if (entries.length === 1) {
    return {
      label: entries[0].label,
      completionCriteria: 'The listed outcome is complete according to the approved checklist source.',
    };
  }
  if (area === 'Bathroom / Faucet') {
    return {
      label: 'Clean and polish faucet',
      completionCriteria: 'Faucet is free of visible water spots, residue, and removable buildup and has been polished.',
    };
  }
  if (area === 'Bathroom / Mirror') {
    return {
      label: 'Clean mirror to a streak-free finish',
      completionCriteria: 'Mirror is clean and visibly streak-free after inspection from multiple angles.',
    };
  }
  if (area === 'Bathroom / Countertops') {
    return {
      label: 'Clear permitted items and clean countertops, edges, and corners',
      completionCriteria: 'Permitted items are moved only as allowed, and countertops and corners are visibly clean.',
    };
  }
  if (area === 'Kitchen / Faucet') {
    return {
      label: 'Clean and polish kitchen faucet',
      completionCriteria: 'Faucet is visibly clean, polished, and free of removable water spots.',
    };
  }
  if (area.includes('Countertops Cleaning')) {
    return {
      label: 'Clean countertops, edges, and corners',
      completionCriteria: 'Countertops and corners are free of visible debris and removable residue.',
    };
  }
  if (area.includes('Countertops Preparation')) {
    return {
      label: 'Prepare countertops for cleaning',
      completionCriteria: 'Loose debris is removed and accessible items and corners are checked before cleaning.',
    };
  }
  if (/Assessment$/.test(area)) {
    return {
      label: `Assess ${fixture.replace(/ Assessment$/, '').toLowerCase()} condition and service needs`,
      completionCriteria: 'The listed condition, priority, and concern checks have been completed before cleaning begins.',
    };
  }
  if (/Quality Inspection|Final Inspection|Final Verification|Final Walkthrough|Turnover Inspection|Deep Clean Inspection/.test(area)) {
    return {
      label: `Complete ${fixture.toLowerCase()}`,
      completionCriteria: 'Every applicable source quality check listed below has been verified.',
    };
  }
  if (/Floors$/.test(area)) {
    return {
      label: `Clean ${area.split('/')[0].trim().toLowerCase()} floors, edges, and accessible areas`,
      completionCriteria: 'Applicable floor preparation, vacuuming, mopping, edge, and accessibility checks are complete.',
    };
  }
  if (/Trash$/.test(area)) {
    return {
      label: `Empty ${area.split('/')[0].trim().toLowerCase()} trash and reset the area`,
      completionCriteria: 'Trash is removed and the liner or surrounding area is reset where applicable.',
    };
  }
  if (/Touch Points$/.test(area)) {
    return {
      label: `Clean ${area.split('/')[0].trim().toLowerCase()} touch points`,
      completionCriteria: 'Every applicable switch, handle, and listed touch point has been cleaned.',
    };
  }
  return {
    label: `Complete ${fixture.toLowerCase()}`,
    completionCriteria: 'Every applicable source step listed for this outcome has been completed.',
  };
}

const groups = (moduleId, definitions) => definitions.flatMap(([area, labels, options]) => (
  taskGroup(moduleId, area, labels, options)
));

const roomModules = {
  bathroom: {
    id: 'room-bathroom-v1',
    sourceFiles: [sourcePath('Bathroom Checklist.md')],
    core: [
      roomOutcome(
        'bathroom-core',
        'Bathroom / Vanity and Sink',
        'Vanity, sink, faucet, and countertops',
        'Clean vanity, sink basin, faucet, countertops, edges, and corners',
        'The vanity area is free of visible debris, residue, removable buildup, and water spots; permitted items are reset.',
        [
          'Verify bathroom access', 'Identify buildup areas', 'Identify hard water staining', 'Identify soap scum',
          'Identify damaged fixtures', { label: 'Document issues if required', condition: 'if required' },
          'Remove debris', 'Clean basin', 'Sanitize basin', 'Rinse properly', 'Clean faucet', 'Polish faucet',
          'Remove water spots', 'Inspect for buildup', { label: 'Remove items if allowed', condition: 'if allowed' },
          'Clean countertops', 'Sanitize countertops', 'Clean corners',
        ],
        { warnings: ['Do not claim sanitizing unless the booking includes it and an approved compatible product and label-supported contact time are available.'] },
      ),
      roomOutcome(
        'bathroom-core', 'Bathroom / Mirror', 'Mirror', 'Clean mirror to a streak-free finish',
        'The mirror is clean and visibly streak-free after inspection from multiple angles.',
        ['Clean mirror', 'Remove streaks', 'Inspect from multiple angles'],
      ),
      roomOutcome(
        'bathroom-core', 'Bathroom / Toilet', 'Toilet', 'Clean toilet interior, exterior, and base',
        'The toilet bowl, tank, lid, seat, exterior, and accessible base are free of visible soil and removable stains.',
        [
          'Clean tank', 'Clean lid', 'Clean seat', 'Clean exterior', 'Sanitize exterior', 'Clean bowl',
          'Sanitize bowl', 'Remove visible stains', 'Clean around base',
          { label: 'Inspect behind toilet if accessible', condition: 'if accessible' },
        ],
        { warnings: ['Use sanitizing guidance only when explicitly included and supported by an approved compatible product and its label instructions.'] },
      ),
      roomOutcome(
        'bathroom-core', 'Bathroom / Shower or Tub', 'Shower or tub',
        'Clean shower and/or tub, walls, doors, fixtures, and drains',
        'Included shower or tub surfaces, glass or curtain areas, fixtures, and accessible tracks are free of visible residue, water spots, and removable buildup.',
        [
          'Clean walls', 'Remove soap residue', 'Remove visible buildup', 'Clean faucet', 'Clean shower head',
          'Polish fixtures', 'Clean glass', 'Remove water spots',
          { label: 'Clean tracks if included', condition: 'if included' },
        ],
      ),
      roomOutcome(
        'bathroom-core', 'Bathroom / Accessible Surfaces', 'Accessible surfaces and fixtures',
        'Clean accessible bathroom surfaces, storage areas, ventilation cover, and touch points',
        'Reachable shelving, surfaces, vent cover, switches, doors, and cabinet handles are visibly clean.',
        [
          'Dust vent cover', 'Remove visible buildup', 'Dust shelving', 'Clean reachable surfaces',
          'Clean light switches', 'Clean door handles', 'Clean cabinet handles',
        ],
      ),
      roomOutcome(
        'bathroom-core', 'Bathroom / Trash', 'Trash and permitted items',
        'Empty trash and reset permitted items',
        'Trash is removed, the liner is replaced, and permitted items are left neatly reset.',
        ['Empty trash', 'Replace liner'],
      ),
      roomOutcome(
        'bathroom-core', 'Bathroom / Floors', 'Floor', 'Vacuum and mop bathroom floor',
        'The bathroom floor, edges, corners, and accessible areas are free of visible debris and have been vacuumed and mopped.',
        ['Remove debris', 'Inspect corners', 'Vacuum floor', 'Mop floor', 'Clean edges', 'Inspect behind door'],
      ),
      roomOutcome(
        'bathroom-core', 'Bathroom / Final Inspection', 'Final inspection', 'Complete final bathroom inspection',
        'Applicable bathroom outcomes and customer priorities have been visually checked before leaving the room.',
        ['Mirror streak-free', 'Fixtures polished', 'Toilet sanitized', 'Sink sanitized', 'Floor clean', 'Trash removed'],
        { warnings: ['A final inspection does not create a sanitizing claim when sanitizing was not explicitly included and properly performed.'] },
      ),
    ],
    deep: [
      roomOutcome(
        'bathroom-deep', 'Bathroom / Deep Detail', 'Deep-detail scope',
        'Complete approved bathroom deep-detail work',
        'Every deep-detail item explicitly included in the booking scope is complete.',
        [
          { label: 'Hard water removal', condition: 'if included' },
          { label: 'Soap scum removal', condition: 'if included' },
          { label: 'Grout detailing', condition: 'if included' },
          { label: 'Baseboard cleaning', condition: 'if included' },
          { label: 'Door frame cleaning', condition: 'if included' },
          { label: 'Wall spot cleaning', condition: 'if included' },
          { label: 'Vent deep cleaning', condition: 'if included' },
        ],
        { required: false, condition: 'only when included in the approved booking scope' },
      ),
    ],
    moveOut: [],
  },
  kitchen: {
    id: 'room-kitchen-v1',
    sourceFiles: [sourcePath('Kitchen Checklist.md')],
    core: [
      roomOutcome(
        'kitchen-core', 'Kitchen / Countertops and Backsplash', 'Countertops and backsplash',
        'Clear permitted items and clean countertops, backsplash, edges, and corners',
        'Permitted items are moved only as allowed; countertops, backsplash, edges, and corners are free of visible debris, residue, splatter, and removable grease.',
        [
          'Assess overall condition', 'Identify grease buildup', 'Identify food residue', 'Identify hard water buildup',
          'Identify appliance condition', 'Identify customer priorities',
          { label: 'Document issues if required', condition: 'if required' }, 'Remove loose debris',
          'Move accessible items', 'Inspect corners', 'Clean countertops', 'Sanitize countertops', 'Clean corners',
          'Remove visible residue', 'No visible debris', 'No visible residue', 'Sanitized', 'Clean backsplash',
          'Remove splatter', 'Remove grease buildup', 'Clean corners',
        ],
        { warnings: ['Do not claim sanitizing unless the booking includes it and an approved compatible product and label-supported contact time are available.'] },
      ),
      roomOutcome(
        'kitchen-core', 'Kitchen / Sink and Faucet', 'Sink basin, faucet, and drain area',
        'Clean sink basin, faucet, and drain area',
        'The sink basin, faucet, and visible drain area are free of debris, residue, removable buildup, and water spots.',
        ['Remove debris', 'Clean basin', 'Sanitize basin', 'Rinse thoroughly', 'Clean faucet', 'Polish faucet', 'Remove water spots', 'Inspect drain area', 'Remove visible debris'],
        { warnings: ['Sanitizing guidance applies only when explicitly included and supported by an approved compatible product and its label instructions.'] },
      ),
      roomOutcome(
        'kitchen-core', 'Kitchen / Oven Exterior', 'Oven exterior', 'Clean oven exterior and handle',
        'The accessible oven exterior and handle are free of fingerprints, visible residue, and removable grease.',
        ['Clean exterior', 'Clean handle', 'Remove grease residue'],
      ),
      roomOutcome(
        'kitchen-core', 'Kitchen / Appliance Exteriors', 'Appliance exteriors', 'Clean accessible appliance exteriors',
        'Included refrigerator, microwave, and dishwasher exterior surfaces, handles, and controls are visibly clean.',
        [
          'Clean doors', 'Clean handles', 'Clean exterior surfaces',
          { label: 'Clean top if accessible', condition: 'if accessible' },
          'Clean exterior', 'Clean handle', 'Remove fingerprints', 'Clean exterior', 'Clean controls', 'Remove fingerprints',
        ],
      ),
      roomOutcome(
        'kitchen-core', 'Kitchen / Cabinets and Touch Points', 'Cabinet fronts and touch points',
        'Clean cabinet fronts, handles, and kitchen touch points',
        'Cabinet fronts, switches, doors, and appliance and cabinet handles are free of visible fingerprints and removable grease.',
        [
          'Clean cabinet fronts', 'Remove fingerprints', 'Remove grease buildup', 'Clean handles', 'Sanitize handles',
          'Light switches', 'Door handles', 'Appliance handles', 'Cabinet handles',
        ],
        { warnings: ['Sanitizing handles is conditional on approved scope, surface compatibility, product, and contact time.'] },
      ),
      roomOutcome(
        'kitchen-core', 'Kitchen / Dining Surfaces', 'Table, island, or eating area',
        'Clean table, island, or eating area when included',
        'Included tables, chairs, chair legs, islands, and eating surfaces are visibly clean and reset.',
        [
          { label: 'Clean table', condition: 'if present' }, { label: 'Clean chairs', condition: 'if present' },
          { label: 'Clean chair legs', condition: 'if present' }, { label: 'Sanitize surfaces', condition: 'if present' },
        ],
        { condition: 'when present and included' },
      ),
      roomOutcome(
        'kitchen-core', 'Kitchen / Trash', 'Trash and surrounding area', 'Empty trash and reset the surrounding area',
        'Trash is removed, the liner is replaced, and the surrounding area has been checked and reset.',
        ['Empty trash', 'Replace liner', 'Inspect surrounding area'],
      ),
      roomOutcome(
        'kitchen-core', 'Kitchen / Floors', 'Floor', 'Vacuum and mop kitchen floor',
        'The kitchen floor, edges, corners, and accessible areas are free of visible debris and have been vacuumed and mopped.',
        ['Remove debris', 'Inspect corners', 'Inspect under table', 'Vacuum floor', 'Vacuum edges', 'Vacuum corners', 'Mop floor', 'Clean edges', 'Inspect under accessible furniture'],
      ),
      roomOutcome(
        'kitchen-core', 'Kitchen / Final Inspection', 'Final inspection', 'Complete final kitchen inspection',
        'Applicable kitchen outcomes and customer priorities have been visually checked before leaving the room.',
        ['Countertops clean', 'Sink sanitized', 'Appliances clean', 'Cabinet fronts clean', 'Floor clean', 'Trash removed'],
        { warnings: ['A final inspection does not create a sanitizing claim when sanitizing was not explicitly included and properly performed.'] },
      ),
    ],
    deep: [
      roomOutcome(
        'kitchen-deep', 'Kitchen / Heavy Grease Removal', 'Approved heavy-grease scope',
        'Complete approved heavy-grease removal',
        'Every heavy-grease surface explicitly included in the booking scope is visibly free of removable buildup.',
        [
          { label: 'Degrease backsplash', condition: 'if included' },
          { label: 'Degrease cabinet fronts', condition: 'if included' },
          { label: 'Degrease appliance surfaces', condition: 'if included' },
        ],
        { required: false, condition: 'only when included in the approved booking scope' },
      ),
    ],
    moveOut: groups('kitchen-move-out', [
      ['Kitchen / Move-Out Add-Ons', ['Cabinet interiors', 'Drawer interiors', 'Refrigerator interior', 'Oven interior', { label: 'Appliance pull-out cleaning if accessible', condition: 'if accessible' }], { separate: true }],
    ]),
  },
  livingRoom: {
    id: 'room-living-room-v1',
    sourceFiles: [sourcePath('Living Room Checklist.md')],
    core: groups('living-room-core', [
      ['Living Room Assessment', ['Assess room condition', 'Identify heavy dust accumulation', 'Identify pet hair accumulation', 'Identify customer priorities', 'Identify fragile items', { label: 'Document concerns if required', condition: 'if required' }]],
      ['Living Room / Furniture Dusting', ['Dust tables', 'Dust end tables', 'Dust coffee table', 'Dust shelves', 'Dust bookcases', 'Dust entertainment center']],
      ['Living Room / Decor', ['Dust picture frames', 'Dust decorative items', 'Dust lamps', 'Dust accessible artwork']],
      ['Living Room / Electronics', ['Dust TV exterior', 'Dust monitors', 'Dust speakers', 'Dust game consoles exterior', 'Dust accessible electronics']],
      ['Living Room / Window Areas', ['Dust window sills', 'Remove visible debris', { label: 'Dust blinds', condition: 'if included' }, { label: 'Remove visible buildup', condition: 'if blinds are included' }]],
      ['Living Room / Touch Points', ['Clean light switches', 'Clean door handles', 'Clean cabinet handles', { label: 'Clean remote controls if requested', condition: 'if requested' }]],
      ['Living Room / Cobweb Removal', ['Ceiling corners', 'Room corners', 'Behind furniture if visible']],
      ['Living Room / Sofas and Chairs', [{ label: 'Vacuum cushions if included', condition: 'if included' }, 'Remove visible debris', { label: 'Remove pet hair if included', condition: 'if included' }]],
      ['Living Room / Under Furniture', ['Inspect accessible areas', 'Remove visible debris', 'Vacuum accessible areas']],
      ['Living Room / Floors', ['Remove large debris', 'Inspect corners', 'Inspect edges', 'Vacuum carpet', 'Vacuum edges', 'Vacuum under accessible furniture', 'Vacuum rugs', 'Inspect for debris', 'Vacuum hard floor', 'Mop hard floor', 'Clean edges']],
      ['Living Room / Trash', ['Empty trash', { label: 'Replace liner if applicable', condition: 'if applicable' }]],
      ['Living Room / Quality Inspection', ['Furniture dust-free', 'Electronics dust-free', 'Floors clean', 'Trash removed', 'Customer priorities completed']],
    ]),
    deep: groups('living-room-deep', [
      ['Living Room / Deep Cleaning Add-Ons', ['Dust baseboards', 'Clean baseboards', 'Dust trim', 'Clean trim', 'Dust frames', { label: 'Clean frames if included', condition: 'if included' }, 'Baseboards detailed', 'Trim detailed', 'Door frames detailed', 'Blind cleaning', 'Furniture detailing', 'Wall spot cleaning', 'Vent dusting'], { required: false, separate: true }],
    ]),
    moveOut: groups('living-room-move-out', [
      ['Living Room / Move-Out Add-Ons', ['Baseboards detailed', 'Window sill detailing', 'Door frame detailing', 'Final turnover inspection']],
    ]),
  },
  bedroom: {
    id: 'room-bedroom-v1',
    sourceFiles: [sourcePath('Bedroom Checklist.md')],
    core: groups('bedroom-core', [
      ['Bedroom Assessment', ['Assess room condition', 'Identify dust accumulation', 'Identify pet hair', 'Identify clutter concerns', 'Identify customer priorities', { label: 'Document issues if required', condition: 'if required' }]],
      ['Bedroom / Furniture Dusting', ['Dust nightstands', 'Dust dressers', 'Dust desks', 'Dust shelves', 'Dust headboard', 'Dust accessible furniture']],
      ['Bedroom / Decor', ['Dust picture frames', 'Dust lamps', 'Dust decorative items', 'Dust accessible artwork']],
      ['Bedroom / Electronics', ['Dust television exterior', 'Dust monitor exterior', 'Dust alarm clock', 'Dust accessible electronics']],
      ['Bedroom / Window Areas', ['Dust window sills', 'Remove visible debris', { label: 'Dust blinds', condition: 'if included' }, { label: 'Remove visible buildup', condition: 'if blinds are included' }]],
      ['Bedroom / Touch Points', ['Clean light switches', 'Clean door handles', 'Clean closet handles']],
      ['Bedroom / Cobweb Removal', ['Ceiling corners', 'Room corners', 'Closet corners']],
      ['Bedroom / Bed Care', ['Straighten bedding', { label: 'Make bed if requested', condition: 'if requested' }, 'Arrange pillows']],
      ['Bedroom / Closets', ['Dust shelves', 'Remove cobwebs', 'Vacuum floor', 'Inspect corners']],
      ['Bedroom / Under Furniture', ['Inspect accessible areas', 'Remove visible debris', 'Vacuum accessible areas']],
      ['Bedroom / Floors', ['Vacuum carpet', 'Vacuum edges', 'Vacuum under accessible furniture', 'Vacuum rugs', 'Remove visible debris', 'Vacuum floor', 'Mop floor', 'Clean edges']],
      ['Bedroom / Trash', ['Empty trash', { label: 'Replace liner if applicable', condition: 'if applicable' }]],
      ['Bedroom / Quality Inspection', ['Furniture dust-free', 'Bed properly presented', 'Floors clean', 'Trash removed', 'Customer priorities completed']],
    ]),
    deep: groups('bedroom-deep', [
      ['Bedroom / Deep Cleaning Add-Ons', ['Dust baseboards', 'Clean baseboards', 'Dust trim', 'Clean trim', 'Dust frames', { label: 'Clean frames if included', condition: 'if included' }, 'Baseboards detailed', 'Trim detailed', 'Door frame detailing', 'Blind cleaning', 'Wall spot cleaning', 'Vent dusting'], { required: false, separate: true }],
    ]),
    moveOut: groups('bedroom-move-out', [
      ['Bedroom / Move-Out Add-Ons', ['Closet detailing', 'Window sill detailing', 'Baseboard detailing', 'Final turnover inspection']],
    ]),
  },
  laundryRoom: {
    id: 'room-laundry-room-v1',
    sourceFiles: [sourcePath('Laundry Room Checklist.md')],
    core: groups('laundry-core', [
      ['Laundry Room Assessment', ['Assess room condition', 'Identify dust accumulation', 'Identify lint buildup', 'Identify pet hair', 'Identify customer priorities', { label: 'Document issues if required', condition: 'if required' }]],
      ['Laundry Room / Surfaces', ['Dust shelves', 'Dust storage areas', 'Dust counters', 'Dust accessible surfaces', { label: 'Dust utility sink area if present', condition: 'if present' }, { label: 'Dust folding area if present', condition: 'if present' }, 'Dust storage cabinets exterior']],
      ['Laundry Room / Washer', ['Clean exterior', 'Clean controls', 'Remove fingerprints', 'Wipe top surface', 'Check for visible leaks', { label: 'Report concerns if observed', condition: 'if observed' }]],
      ['Laundry Room / Dryer', ['Clean exterior', 'Clean controls', 'Remove fingerprints', 'Wipe top surface', 'Check for visible issues', { label: 'Report concerns if observed', condition: 'if observed' }]],
      ['Laundry Room / Storage Areas', ['Dust shelving', 'Dust accessible storage', 'Dust cabinet exteriors']],
      ['Laundry Room / Touch Points', ['Clean light switches', 'Clean door handles', 'Clean cabinet handles']],
      ['Laundry Room / Cobweb Removal', ['Ceiling corners', 'Room corners', 'Storage corners']],
      ['Laundry Room / Under and Behind Machines', ['Inspect accessible areas', 'Remove visible debris']],
      ['Laundry Room / Floors', ['Remove debris', 'Inspect corners', 'Vacuum floor', 'Vacuum edges', 'Vacuum corners', 'Mop floor', 'Clean edges']],
      ['Laundry Room / Trash', [{ label: 'Empty trash if present', condition: 'if present' }, { label: 'Replace liner if applicable', condition: 'if applicable' }]],
      ['Laundry Room / Quality Inspection', ['Machines clean', 'Shelves dust-free', 'Floor clean', 'Debris removed', 'Customer priorities completed']],
    ]),
    deep: groups('laundry-deep', [
      ['Laundry Room / Deep Cleaning Add-Ons', [{ label: 'Vacuum behind machines if accessible', condition: 'if accessible' }, 'Remove lint accumulation', 'Remove dust buildup', 'Dust baseboards', 'Clean baseboards', 'Dust trim', 'Clean trim', 'Behind-machine cleaning', 'Lint buildup removal', 'Baseboard detailing', 'Door frame detailing', 'Wall spot cleaning'], { required: false, separate: true }],
    ]),
    moveOut: groups('laundry-move-out', [
      ['Laundry Room / Move-Out Add-Ons', ['Utility area detailing', 'Storage area detailing', 'Final turnover inspection']],
    ]),
  },
  entryway: {
    id: 'room-entryway-v1',
    sourceFiles: [sourcePath('Entryway Checklist.md')],
    core: groups('entryway-core', [
      ['Entryway Assessment', ['Assess condition', 'Identify debris accumulation', 'Identify customer priorities']],
      ['Entryway / Door Area', ['Clean interior door surface', 'Clean door handle', 'Clean surrounding area', { label: 'Spot clean glass if applicable', condition: 'if applicable' }]],
      ['Entryway / Dusting', ['Dust furniture', 'Dust shelves', 'Dust decor', 'Dust window sills']],
      ['Entryway / Touch Points', ['Clean switches', 'Clean handles', { label: 'Clean railings if present', condition: 'if present' }]],
      ['Entryway / Floors', ['Vacuum floor', 'Vacuum mats', 'Mop hard floors', 'Clean edges']],
      ['Entryway / Quality Inspection', ['Door area clean', 'Floors clean', 'First impression ready']],
    ]),
    deep: [],
    moveOut: [],
  },
  hallway: {
    id: 'room-hallway-v1',
    sourceFiles: [sourcePath('Hallway Checklist.md')],
    core: groups('hallway-core', [
      ['Hallway Tasks', ['Dust surfaces', 'Dust decor', { label: 'Dust baseboards if included', condition: 'if included' }, 'Clean switches', 'Clean handles', 'Remove cobwebs', 'Vacuum floor', 'Mop floor']],
      ['Hallway / Quality Inspection', ['Pathway clear', 'Floors clean', 'Dust removed']],
    ]),
    deep: [],
    moveOut: [],
  },
  office: {
    id: 'room-office-v1',
    sourceFiles: [sourcePath('Office Checklist.md')],
    core: groups('office-core', [
      ['Office Assessment', ['Assess room condition', 'Identify confidential materials', 'Identify customer priorities']],
      ['Office / Desk Area', ['Dust desk surfaces', 'Dust accessible equipment exteriors', 'Avoid disturbing paperwork', 'Avoid moving confidential items']],
      ['Office / Furniture', ['Dust shelves', 'Dust cabinets', 'Dust chairs', 'Dust furniture']],
      ['Office / Electronics', ['Dust monitors exterior', { label: 'Dust keyboards exterior if approved', condition: 'if approved' }, 'Dust printers exterior', 'Dust equipment exteriors']],
      ['Office / Touch Points', ['Clean switches', 'Clean handles', 'Clean cabinet pulls']],
      ['Office / Floors', ['Vacuum floor', { label: 'Vacuum under desk if accessible', condition: 'if accessible' }, 'Mop hard floors']],
      ['Office / Confidentiality Verification', ['No confidential materials disturbed', 'No documents moved', 'Work area respected']],
      ['Office / Quality Inspection', ['Dust removed', 'Floors clean', 'Office organized appearance maintained']],
    ]),
    deep: [],
    moveOut: [],
  },
};

const oneTimeItems = groups('standard-one-time', [
  ['Property Arrival / Review', ['Review customer notes', 'Review service request', 'Confirm priority areas', 'Confirm special requests']],
  ['Property Arrival / Preparation', ['Gather supplies', 'Begin walkthrough']],
  ['Whole Home / Dust and Cobwebs', ['Remove visible cobwebs', 'Dust reachable surfaces', 'Dust window sills']],
  ['Whole Home / Touch Points', ['Clean light switches', 'Clean door handles']],
  ['Whole Home / Wall Spot Cleaning', ['Spot clean visible marks']],
  ['Entryway / Dusting', ['Dust surfaces']],
  ['Entryway / Glass', [{ label: 'Clean entry glass if applicable', condition: 'if applicable' }]],
  ['Entryway / Floors', ['Vacuum floor', 'Mop floor']],
  ['Entryway / Reset', [{ label: 'Straighten visible items if requested', condition: 'if requested' }]],
  ['Living Room / Dusting', ['Dust furniture', 'Dust decor', 'Dust shelves', 'Dust electronics exterior']],
  ['Living Room / Touch Points and Cobwebs', ['Clean light switches', 'Clean door handles', 'Remove cobwebs']],
  ['Living Room / Floors', ['Vacuum carpet', 'Vacuum rugs', 'Mop hard floors']],
  ['Dining Room / Dusting', ['Dust table', 'Dust chairs', 'Dust decor']],
  ['Dining Room / Touch Points', ['Clean switches', 'Clean handles']],
  ['Dining Room / Floors', ['Vacuum floor', 'Mop floor']],
  ['Kitchen / Countertops', ['Clean countertops', 'Sanitize countertops']],
  ['Kitchen / Sink', ['Clean sink']],
  ['Kitchen / Faucet', ['Polish faucet']],
  ['Kitchen / Appliance Exteriors', ['Refrigerator exterior', 'Oven exterior', 'Microwave exterior', 'Dishwasher exterior']],
  ['Kitchen / Cabinets and Backsplash', ['Spot clean cabinet fronts', 'Clean backsplash']],
  ['Kitchen / Touch Points', ['Clean switches', 'Clean handles']],
  ['Kitchen / Trash', ['Empty trash', 'Replace liner']],
  ['Kitchen / Floors', ['Vacuum floor', 'Mop floor']],
  ['Bathroom / Sink and Faucet', ['Clean sink', 'Clean faucet', 'Polish fixtures']],
  ['Bathroom / Mirror', ['Clean mirror']],
  ['Bathroom / Toilet', ['Clean bowl', 'Sanitize bowl', 'Clean exterior', 'Sanitize exterior']],
  ['Bathroom / Shower or Tub', ['Clean shower or tub surfaces', 'Remove visible residue', 'Clean shower or tub fixtures']],
  ['Bathroom / Surfaces', ['Dust surfaces', 'Clean counters']],
  ['Bathroom / Trash', ['Empty trash', 'Replace liner']],
  ['Bathroom / Floors', ['Vacuum floor', 'Mop floor']],
  ['Bedroom / Dusting', ['Dust furniture', 'Dust reachable surfaces', 'Dust window sills']],
  ['Bedroom / Cobwebs', ['Remove cobwebs']],
  ['Bedroom / Bed', [{ label: 'Make bed if requested', condition: 'if requested' }]],
  ['Bedroom / Floors', ['Vacuum floor', 'Mop floor']],
  ['Bedroom / Trash', ['Empty trash']],
  ['Laundry Room / Surfaces', ['Dust surfaces']],
  ['Laundry Room / Appliances', ['Clean appliance exteriors']],
  ['Laundry Room / Floors', ['Vacuum floor', 'Mop floor']],
  ['Final Walkthrough', ['Verify customer priorities completed', 'Verify trash removed', 'Verify supplies collected', 'Verify rooms completed', 'Verify add-ons completed']],
  ['Completion Documentation', [{ label: 'Take completion photos if required', condition: 'if required' }, 'Document customer requests completed', 'Record labor hours', 'Mark job complete']],
]);

const recurringItems = groups('standard-recurring', [
  ['Property Arrival / Arrival', ['Arrive on time', 'Park appropriately', 'Enter property per instructions']],
  ['Property Arrival / Preparation', ['Gather supplies', 'Review customer notes', 'Confirm service scope']],
  ['Entryway / Dusting', ['Remove cobwebs', 'Dust surfaces', 'Dust decor']],
  ['Entryway / Touch Points', ['Clean light switches', 'Clean door handles']],
  ['Entryway / Glass', [{ label: 'Spot clean glass if applicable', condition: 'if applicable' }]],
  ['Entryway / Floors', ['Vacuum floor', 'Mop hard floors']],
  ['Living Room / Dusting', ['Dust all reachable surfaces', 'Dust furniture', 'Dust electronics exterior', 'Dust decor', 'Dust window sills', 'Remove cobwebs']],
  ['Living Room / Touch Points', ['Clean light switches', 'Clean door handles']],
  ['Living Room / Furniture', [{ label: 'Vacuum furniture if included', condition: 'if included' }]],
  ['Living Room / Floors', ['Vacuum carpets or rugs', 'Mop hard floors']],
  ['Living Room / Trash', ['Empty trash']],
  ['Dining Room / Dusting', ['Dust table', 'Dust chairs', 'Dust decor', 'Dust reachable surfaces']],
  ['Dining Room / Touch Points', ['Clean light switches', 'Clean door handles']],
  ['Dining Room / Floors', ['Vacuum floor', 'Mop hard floors']],
  ['Dining Room / Trash', ['Empty trash']],
  ['Kitchen / Countertops', ['Clean countertops', 'Sanitize countertops']],
  ['Kitchen / Sink', ['Clean sink']],
  ['Kitchen / Faucet', ['Polish faucet']],
  ['Kitchen / Appliance Exteriors', ['Refrigerator exterior', 'Oven exterior', 'Microwave exterior', 'Dishwasher exterior']],
  ['Kitchen / Cabinets and Backsplash', ['Spot clean cabinet fronts', 'Clean backsplash']],
  ['Kitchen / Touch Points', ['Clean light switches', 'Clean door handles']],
  ['Kitchen / Trash', ['Empty trash', 'Replace trash liner']],
  ['Kitchen / Floors', ['Vacuum floor', 'Mop floor']],
  ['Bathroom / Sink and Faucet', ['Clean sink', 'Clean faucet', 'Polish fixtures']],
  ['Bathroom / Mirror', ['Clean mirror']],
  ['Bathroom / Toilet', ['Clean toilet exterior', 'Sanitize toilet exterior', 'Clean toilet bowl', 'Sanitize toilet bowl']],
  ['Bathroom / Shower or Tub', ['Clean shower or tub walls', 'Clean shower or tub fixtures', 'Remove visible soap residue']],
  ['Bathroom / Surfaces', ['Dust reachable surfaces', 'Clean counters']],
  ['Bathroom / Trash', ['Empty trash', 'Replace liner']],
  ['Bathroom / Floors', ['Vacuum floor', 'Mop floor']],
  ['Bedroom / Dusting', ['Dust furniture', 'Dust reachable surfaces', 'Dust window sills', 'Remove cobwebs']],
  ['Bedroom / Touch Points', ['Clean light switches', 'Clean door handles']],
  ['Bedroom / Bed', [{ label: 'Make bed if requested', condition: 'if requested' }]],
  ['Bedroom / Floors', ['Vacuum carpet', 'Mop hard floor']],
  ['Bedroom / Trash', ['Empty trash']],
  ['Laundry Room / Surfaces', ['Dust surfaces']],
  ['Laundry Room / Appliances', ['Clean appliance exteriors']],
  ['Laundry Room / Touch Points', ['Clean light switches']],
  ['Laundry Room / Floors', ['Vacuum floor', 'Mop floor']],
  ['Final Walkthrough', ['Verify all rooms completed', 'Verify trash removed', 'Verify supplies collected', { label: 'Verify doors locked if required', condition: 'if required' }, 'Mark job complete']],
]);

const maintenanceItems = groups('maintenance', [
  ['Property Arrival / Review', ['Review customer notes', 'Review recurring preferences']],
  ['Property Arrival / Preparation', ['Gather supplies', 'Begin cleaning']],
  ['Living Areas / Dusting', ['Dust reachable surfaces', 'Dust decor']],
  ['Living Areas / Floors', ['Vacuum carpets', 'Vacuum rugs', 'Mop hard floors']],
  ['Living Areas / Trash', ['Empty trash']],
  ['Kitchen / Countertops', ['Clean countertops', 'Sanitize countertops']],
  ['Kitchen / Sink and Faucet', ['Clean sink', 'Polish faucet']],
  ['Kitchen / Appliances', ['Clean appliance exteriors']],
  ['Kitchen / Trash', ['Empty trash', 'Replace liner']],
  ['Kitchen / Floors', ['Vacuum floor', 'Mop floor']],
  ['Bathroom / Sink and Mirror', ['Clean sink', 'Clean mirror']],
  ['Bathroom / Toilet', ['Clean toilet', 'Sanitize toilet']],
  ['Bathroom / Shower', ['Clean shower surfaces']],
  ['Bathroom / Trash', ['Empty trash', 'Replace liner']],
  ['Bathroom / Floors', ['Vacuum floor', 'Mop floor']],
  ['Bedroom / Dusting', ['Dust furniture', 'Dust reachable surfaces']],
  ['Bedroom / Bed', [{ label: 'Make beds if requested', condition: 'if requested' }]],
  ['Bedroom / Floors', ['Vacuum floors']],
  ['Bedroom / Trash', ['Empty trash']],
  ['Final Verification', ['Verify recurring standards met', 'Verify customer requests completed', 'Verify property secured', 'Mark complete']],
]);

const deepServiceItems = groups('deep-service', [
  ['Property Arrival', ['Review estimate', 'Review customer notes', 'Review scope of work', 'Identify priority areas', 'Confirm service expectations']],
  ['Whole Home Tasks', ['Remove cobwebs throughout property', 'Dust ceiling corners', 'Dust vents', 'Dust return vents', 'Dust blinds', 'Dust window sills', 'Dust door frames', 'Dust baseboards', 'Dust trim', 'Clean light switches', 'Clean outlet covers', 'Clean door handles', { label: 'Spot clean walls', condition: 'approved areas only', note: 'Approved areas only.' }]],
  ['Closets', ['Remove cobwebs', 'Dust shelving', 'Dust corners', 'Vacuum floor', { label: 'Mop floor', condition: 'if applicable' }]],
  ['Deep Clean Inspection', ['Detail work completed', 'Customer priorities completed', 'Deep clean standards met']],
  ['Final Quality Inspection', ['Kitchen passed inspection', 'Bathrooms passed inspection', 'Bedrooms passed inspection', 'Living areas passed inspection', 'Floors passed inspection', 'Customer priorities completed']],
  ['Completion Documentation', ['Document issues discovered', 'Document damaged items', 'Record labor hours', 'Record supply usage', 'Mark job complete']],
]);

const moveOutServiceItems = groups('move-out-service', [
  ['Property Assessment', ['Review work order', 'Review property size', 'Review customer notes', 'Review landlord requirements', 'Review management requirements', 'Document existing damage', 'Take before photos']],
  ['Kitchen / Move-Out Specific Additions', ['Cabinet interiors', 'Drawer interiors', 'Refrigerator interior', 'Freezer interior', 'Oven interior', 'Microwave interior', { label: 'Under appliances if accessible', condition: 'if accessible' }]],
  ['Closets', ['Remove debris', 'Detail shelving', 'Detail corners', 'Inspect for forgotten items']],
  ['Walls', ['Spot clean walls', 'Remove visible marks', 'Report damage']],
  ['Doors', ['Clean doors', 'Clean door frames', 'Clean handles']],
  ['Baseboards', ['Clean baseboards', 'Detail corners']],
  ['Windows', [{ label: 'Clean interior glass if included', condition: 'if included' }, { label: 'Clean tracks if included', condition: 'if included' }, 'Clean sills']],
  ['Turnover Inspection', ['Property empty', 'Property clean', 'No visible debris', 'No trash remaining', 'Ready for inspection']],
  ['Documentation', ['Before photos', 'After photos', 'Damage documentation', 'Labor tracking', 'Supply tracking']],
  ['Quality Inspection', ['All rooms completed', 'Appliances completed', 'Cabinets completed', 'Turnover ready']],
]);

const addOnModules = {
  oven: [roomOutcome(
    'addon-oven', 'Kitchen / Selected Add-On', 'Oven interior', 'Interior oven cleaning',
    'The selected oven interior is free of visible debris and approved removable buildup.',
    ['Remove debris', 'Clean interior', 'Remove approved buildup'],
    { required: false, condition: 'when selected in the approved booking scope' },
  )],
  fridge: [roomOutcome(
    'addon-fridge', 'Kitchen / Selected Add-On', 'Refrigerator interior', 'Interior refrigerator cleaning',
    'The selected refrigerator interior, shelves, and drawers are visibly clean and reset.',
    ['Remove debris', 'Clean shelves', 'Clean drawers', 'Sanitize surfaces'],
    {
      required: false,
      condition: 'when selected in the approved booking scope',
      warnings: ['Sanitizing applies only with an approved compatible product and label-supported contact time.'],
    },
  )],
  insideCabinets: [roomOutcome(
    'addon-inside-cabinets', 'Kitchen / Selected Add-On', 'Cabinet interiors', 'Interior cabinets',
    'Selected cabinet interiors and shelves are free of visible debris and residue, and permitted contents are reset.',
    ['Empty cabinet', 'Vacuum debris', 'Clean interior surfaces', 'Wipe shelves', 'Replace contents'],
    { required: false, condition: 'when selected in the approved booking scope' },
  )],
  baseboards: taskGroup('addon-baseboards', 'Whole Home / Selected Add-On', ['Baseboards'], { required: false }),
  windows: taskGroup('addon-windows', 'Whole Home / Selected Add-On', ['Interior windows'], { required: false }),
  blindCleaning: taskGroup('addon-blinds', 'Whole Home / Selected Add-On', ['Blind cleaning'], { required: false }),
  wallSpotCleaning: taskGroup('addon-walls', 'Whole Home / Selected Add-On', ['Wall washing'], { required: false }),
};

const petModifier = groups('modifier-pet-home', [
  ['Pet Home / Initial Assessment', ['Assess pet hair level', 'Assess pet odor concerns', 'Assess furniture contamination', 'Assess floor contamination', 'Assess customer priorities']],
  ['Pet Home / Living Areas', ['Remove pet hair from furniture', 'Remove pet hair from rugs', 'Remove pet hair from corners', 'Inspect under furniture']],
  ['Pet Home / Bedrooms', ['Remove pet hair from bedding surfaces', 'Remove pet hair from furniture', 'Inspect corners']],
  ['Pet Home / Floors', ['Extra vacuum pass', 'Edge vacuuming', 'Corner vacuuming', 'Rug inspection']],
  ['Pet Home / Air Quality', ['Inspect vents', 'Remove visible fur accumulation']],
  ['Pet Home / Quality Inspection', ['Visible pet hair removed', 'Customer priorities completed']],
]);

const sourceFilesForRooms = Object.values(roomModules).flatMap(module => module.sourceFiles);

const templateDefinitions = {
  'standard-one-time': {
    templateName: 'Standard One-Time Clean',
    templateVersion: '2.0.0',
    sourceFiles: [sourcePath('One-Time Cleaning Checklist.md')],
    items: oneTimeItems,
  },
  'standard-recurring': {
    templateName: 'Standard Recurring Cleaning',
    templateVersion: '2.0.0',
    sourceFiles: [sourcePath('Standard Recurring Cleaning Checklist.md')],
    items: recurringItems,
  },
  maintenance: {
    templateName: 'Maintenance Cleaning',
    templateVersion: '2.0.0',
    sourceFiles: [sourcePath('Maintenance Cleaning Checklist.md')],
    items: maintenanceItems,
  },
  'deep-clean': {
    templateName: 'Deep Clean',
    templateVersion: '2.0.0',
    sourceFiles: [
      sourcePath('Deep Cleaning Service Checklist.md'),
      sourcePath('Initial Deep Clean Checklist.md'),
      ...sourceFilesForRooms,
    ],
    items: deepServiceItems,
    roomMode: 'deep',
  },
  'move-out-clean': {
    templateName: 'Move-Out Clean',
    templateVersion: '2.0.0',
    sourceFiles: [sourcePath('Move-Out Cleaning Checklist.md'), ...sourceFilesForRooms],
    items: moveOutServiceItems,
    roomMode: 'moveOut',
  },
  'bathroom-focus': {
    templateName: 'Bathroom Focus',
    templateVersion: '2.0.0',
    sourceFiles: [sourcePath('Bathroom Checklist.md')],
    items: roomModules.bathroom.core,
  },
  'kitchen-focus': {
    templateName: 'Kitchen Focus',
    templateVersion: '2.0.0',
    sourceFiles: [sourcePath('Kitchen Checklist.md')],
    items: roomModules.kitchen.core,
  },
};

export const CHECKLIST_TEMPLATE_IDS = Object.freeze(Object.keys(templateDefinitions));

export const CHECKLIST_SOURCE_CONFLICTS = Object.freeze([
  {
    id: 'legacy-moveout-means-move-in-or-move-out',
    message: 'Legacy cleaningType "moveout" is labeled Move-In / Move-Out and cannot safely select Move-Out automatically.',
  },
  {
    id: 'deep-dining-room-has-no-standalone-module',
    message: 'Deep Clean has Initial Deep dining-room tasks but no canonical standalone Dining Room checklist.',
  },
  {
    id: 'move-out-dining-room-not-listed',
    message: 'Move-Out service assembly does not list a standalone Dining Room module.',
  },
]);

function cloneItems(items) {
  return items.map(item => ({
    ...item,
    jobAidSteps: (item.jobAidSteps || []).map(step => ({ ...step })),
    warnings: Array.isArray(item.warnings) ? [...item.warnings] : [],
    approvedMethodIds: [...item.approvedMethodIds],
    sourceReferences: [...(item.sourceReferences || [])],
  }));
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.area.trim().toLowerCase()}|${item.label.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getRoomModuleItems(roomKey, mode = 'core') {
  const module = roomModules[roomKey];
  if (!module) return [];
  const items = [...module.core, ...(mode === 'deep' ? module.deep : []), ...(mode === 'moveOut' ? module.moveOut : [])];
  return cloneItems(dedupeItems(items));
}

export function getChecklistAddOnItems(addOnKey) {
  return cloneItems(addOnModules[addOnKey] || []);
}

export function getChecklistModifierItems(modifierKey) {
  return modifierKey === 'pet-home' ? cloneItems(petModifier) : [];
}

export function getChecklistTemplate(templateId) {
  const definition = templateDefinitions[templateId];
  if (!definition) return null;
  return {
    sourceRepository: SOURCE_REPOSITORY,
    sourceFiles: [...definition.sourceFiles],
    sourceVersionOrDate: SOURCE_VERSION,
    importedAt: IMPORTED_AT,
    templateId,
    templateName: definition.templateName,
    templateVersion: definition.templateVersion,
    roomMode: definition.roomMode || null,
    items: cloneItems(definition.items),
  };
}

export function listChecklistTemplates() {
  return CHECKLIST_TEMPLATE_IDS.map(getChecklistTemplate);
}
