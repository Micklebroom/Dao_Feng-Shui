import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTables } from '../../src/data/node-loader.js';
import { computeGeomanticChart, flightDirectionFor } from '../../src/engine/flyingstars.js';

const T = loadTables();

/**
 * ВНЕШНЯЯ ВАЛИДАЦИЯ ПРОТИВ ОПУБЛИКОВАННЫХ КАРТ.
 * Источник: en.wikibooks.org/wiki/Feng_Shui/Flying_Star_Feng_Shui/Period_N
 * Формат записи в источнике: ^{горная}{основа}^{водная}
 * Порядок дворцов: ЮВ Ю ЮЗ / В Ц З / СВ С СЗ (Юг сверху).
 *
 * Это самая сильная доступная проверка: 9 независимых карт x 9 дворцов x 3 звезды.
 */
const DIRS = ['SE', 'S', 'SW', 'E', 'C', 'W', 'NE', 'N', 'NW'];

const REFERENCE_CHARTS = [
  { period: 9, sitting: 'S2',  grid: ['386', '841', '168', '277', '495', '623', '732', '959', '514'] },
  { period: 9, sitting: 'W2',  grid: ['188', '643', '861', '979', '297', '425', '534', '752', '316'] },
  { period: 9, sitting: 'NW2', grid: ['287', '643', '465', '376', '198', '821', '732', '554', '919'] },
  { period: 9, sitting: 'NE2', grid: ['485', '841', '663', '574', '396', '128', '939', '752', '217'] },
  { period: 9, sitting: 'NE1', grid: ['287', '742', '969', '178', '396', '524', '633', '851', '415'] },
  { period: 9, sitting: 'SW1', grid: ['782', '247', '969', '871', '693', '425', '336', '158', '514'] },
  { period: 9, sitting: 'SW2', grid: ['584', '148', '366', '475', '693', '821', '939', '257', '712'] },
  { period: 9, sitting: 'E2',  grid: ['881', '346', '168', '979', '792', '524', '435', '257', '613'] },
  { period: 9, sitting: 'SE2', grid: ['782', '346', '564', '673', '891', '128', '237', '455', '919'] },
  { period: 5, sitting: 'W3',  grid: ['844', '398', '126', '935', '753', '571', '489', '217', '662'] },
  { period: 5, sitting: 'NW1', grid: ['745', '299', '927', '836', '654', '472', '381', '118', '563'] },
  { period: 5, sitting: 'NW2', grid: ['543', '198', '321', '432', '654', '876', '987', '219', '765'] },
  { period: 5, sitting: 'NW3', grid: ['543', '198', '321', '432', '654', '876', '987', '219', '765'] },
  { period: 5, sitting: 'N3',  grid: ['241', '695', '423', '332', '159', '877', '786', '514', '968'] },
  { period: 5, sitting: 'NE2', grid: ['741', '396', '528', '639', '852', '174', '285', '417', '963'] },
  { period: 5, sitting: 'NE3', grid: ['741', '396', '528', '639', '852', '174', '285', '417', '963'] },
  { period: 5, sitting: 'SE2', grid: ['345', '891', '123', '234', '456', '678', '789', '912', '567'] },
  { period: 5, sitting: 'SE3', grid: ['345', '891', '123', '234', '456', '678', '789', '912', '567'] },
  { period: 8, sitting: 'NW3', grid: ['178', '533', '351', '269', '987', '715', '624', '442', '896'] },
  { period: 7, sitting: 'NW3', grid: ['765', '321', '543', '654', '876', '198', '219', '432', '987'] },
  { period: 2, sitting: 'NW3', grid: ['412', '866', '684', '593', '321', '148', '957', '775', '239'] },
  { period: 2, sitting: 'SE3', grid: ['214', '668', '486', '395', '123', '841', '759', '577', '932'] }
];

function facingDegreesForSitting(code) {
  const m = T.mountains24.items.find((x) => x.code === code);
  if (!m) throw new Error('Неизвестная гора: ' + code);
  return ((m.start + 7.5) + 180) % 360;
}

for (const ref of REFERENCE_CHARTS) {
  test(`Эталон Wikibooks: период ${ref.period}, сидение ${ref.sitting}`, () => {
    const chart = computeGeomanticChart(
      { period: ref.period, facingDegrees: facingDegreesForSitting(ref.sitting) },
      T
    );
    assert.equal(chart.sitting.code, ref.sitting, 'гора сидения');

    DIRS.forEach((d, i) => {
      const s = ref.grid[i];
      const [mtn, base, water] = [Number(s[0]), Number(s[1]), Number(s[2])];
      assert.equal(chart.mountainStars[d], mtn, `${d}: горная звезда`);
      assert.equal(chart.earthBase[d], base, `${d}: земная основа`);
      assert.equal(chart.waterStars[d], water, `${d}: водная звезда`);
    });
  });
}

test('Сводка: все эталонные карты совпадают по всем 3 картам звёзд', () => {
  let checked = 0;
  for (const ref of REFERENCE_CHARTS) {
    const chart = computeGeomanticChart(
      { period: ref.period, facingDegrees: facingDegreesForSitting(ref.sitting) }, T
    );
    DIRS.forEach((d, i) => {
      const s = ref.grid[i];
      assert.equal(chart.mountainStars[d], Number(s[0]));
      assert.equal(chart.earthBase[d], Number(s[1]));
      assert.equal(chart.waterStars[d], Number(s[2]));
      checked += 3;
    });
  }
  assert.equal(checked, REFERENCE_CHARTS.length * 27);
  console.log(`    проверено значений звёзд: ${checked}`);
});

test('Правило полярности звезды 5 требует номер периода', () => {
  // Регрессионный тест к найденному дефекту: раньше звезда 5 в центре
  // молча считалась «летящей вперёд», что ломало период 9 / сидение S2.
  // Период 9, фасад N2 / сидение S2: земная основа севера = 5 -> водная звезда центра = 5.
  const chart = computeGeomanticChart({ period: 9, facingDegrees: 0 }, T);
  assert.equal(chart.flight.waterCenter, 5, 'водная звезда центра = 5');
  assert.equal(chart.flight.mountainCenter, 4, 'горная звезда центра = 4');
  // Период 9 -> дворец 9 (Юг), триада «небо» -> гора S2 (У) -> инь -> полёт назад.
  assert.equal(chart.flight.waterForward, false,
    'звезда 5 берёт полярность периода 9 (S2 У — инь) и летит назад');
  // Без правила полярности периода звезда 5 не может быть разрешена вовсе.
  assert.throws(() => flightDirectionFor(5, 'heaven', T, null), /номер периода/);
  assert.throws(() => flightDirectionFor(5, 'heaven', T, 5), /номер периода/);
});
