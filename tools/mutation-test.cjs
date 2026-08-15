#!/usr/bin/env node
/**
 * mutation-test.cjs — МУТАЦИОННОЕ ТЕСТИРОВАНИЕ JSON-валидатора.
 *
 * Зелёный валидатор ничего не доказывает, если он не умеет краснеть.
 * Скрипт вносит в data/*.json по одному заведомому дефекту каждого класса
 * из задания (битый JSON, неверный тип, отсутствующее значение, дубликат ID,
 * висячая ссылка, цикл, выдуманное число) и требует, чтобы
 * tools/validate-json.js завершился с кодом 1. Затем данные восстанавливаются
 * и проверяется, что валидатор снова зелёный.
 *
 * ВАЖНО: скрипт временно изменяет файлы в data/ и восстанавливает их из
 * памяти в конце и после каждого случая. Запускать на чистом дереве.
 */
const {execSync}=require('child_process');
const fs=require('fs');
const F='data/', bak={};
for(const f of fs.readdirSync(F)) if(f.endsWith('.json')) bak[f]=fs.readFileSync(F+f,'utf8');
const restore=()=>{for(const f in bak) fs.writeFileSync(F+f,bak[f]);};
const load=(f)=>JSON.parse(fs.readFileSync(F+f,'utf8'));
const save=(f,o)=>fs.writeFileSync(F+f,JSON.stringify(o,null,2));
const run=()=>{try{execSync('node tools/validate-json.js',{stdio:'pipe'});return 0;}catch(e){return 1;}};

const cases=[
 ['[1] битый JSON',()=>fs.writeFileSync(F+'gua.json','{ broken')],
 ['[3] неверный тип',()=>{const d=load('elements.json');d.items[0].generates=42;save('elements.json',d);}],
 ['[5] пустое обязательное поле',()=>{const d=load('gua.json');d.title='';save('gua.json',d);}],
 ['[3] отсутствует обязательное поле',()=>{const d=load('meridians.json');delete d.items[0].element;save('meridians.json',d);}],
 ['[4] дубликат ID',()=>{const d=load('stems_branches.json');d.stems[1].id=d.stems[0].id;save('stems_branches.json',d);}],
 ['[4] индекс не совпадает с позицией',()=>{const d=load('stems_branches.json');d.branches[3].index=9;save('stems_branches.json',d);}],
 ['[5] висячая ссылка на стихию',()=>{const d=load('meridians.json');d.items[0].element='plasma';save('meridians.json',d);}],
 ['[5] висячая ссылка в скрытых стволах',()=>{const d=load('stems_branches.json');d.hiddenStems.byBranch.zi[0].stem='nope';save('stems_branches.json',d);}],
 ['[5] висячая ссылка меридиана в обогревателе',()=>{const d=load('meridians.json');d.tripleBurner.groups[0].members[0]='pericardium';save('meridians.json',d);}],
 ['[6] ссылка на несуществующую заглушку',()=>{const d=load('meridians.json');d.strengthModel.placeholderRef='PH-NOPE';save('meridians.json',d);}],
 ['[6] ссылка на несуществующий конфликт',()=>{const d=load('gua.json');d.conflictRefs=['K99'];save('gua.json',d);}],
 ['[7] циклическая ссылка между файлами',()=>{const d=load('gua.json');d.loop='./meridians.json#/x';const m=load('meridians.json');m.loop='./gua.json#/y';save('gua.json',d);save('meridians.json',m);}],
 ['[7] разорванное кольцо стихий',()=>{const d=load('elements.json');d.items[0].generates='wood';save('elements.json',d);}],
 ['[8] скрытые стволы не дают 100',()=>{const d=load('stems_branches.json');d.hiddenStems.byBranch.chou[0].share=99;save('stems_branches.json',d);}],
 ['[8] меридианов не 10',()=>{const d=load('meridians.json');d.items.push({index:10,id:'pericardium',han:'心包',ru:'Перикард',en:'Pericardium',element:'fire',polarity:'yin',organType:'zang',burner:'upper'});save('meridians.json',d);}],
 ['[8] сумма Ло Шу нарушена',()=>{const d=load('luoshu.json');d.palaces[0].number=7;save('luoshu.json',d);}],
 ['[8] неверная долгота термина',()=>{const d=load('calendar.json');d.solarTerms[5].longitude=31;save('calendar.json',d);}],
 ['[8] сектор горы не 15°',()=>{const d=load('mountains24.json');d.items[0].end=355;save('mountains24.json',d);}],
 ['[9] ВЫДУМАННАЯ формула индекса гармоничности',()=>{const d=load('indicators.json');d.harmonyIndex.formula='1 - mad/mean';save('indicators.json',d);}],
 ['[9] ВЫДУМАННЫЕ коэффициенты фаз Ци',()=>{const d=load('bazi.json');d.qiPhases.coefficients={changsheng:0.3};save('bazi.json',d);}],
 ['[9] ВЫДУМАННЫЕ пороги интерпретации',()=>{const d=load('indicators.json');d.interpretationBands.thresholds=[0.72,0.9];save('indicators.json',d);}],
 ['[9] цвет просочился вне colors.json',()=>{const d=load('elements.json');d.items[0].color='#2e7d32';save('elements.json',d);}],
 ['[9] кириллический ключ',()=>{const d=load('gua.json');d['Гуа']=1;save('gua.json',d);}],
 ['[10] VERIFIED без источников',()=>{const d=load('calendar.json');d.sources=['x'];d.sources.length=0;d.sources=[];save('calendar.json',d);}],
 ['[10] indicators не INFERRED',()=>{const d=load('indicators.json');d.status='VERIFIED';save('indicators.json',d);}],
 ['[10] исчез медицинский дисклеймер',()=>{const d=load('meridians.json');delete d.medicalDisclaimer;save('meridians.json',d);}]
];
let caught=0,missed=[];
for(const [name,mut] of cases){
  restore(); mut();
  const r=run();
  if(r===1) caught++; else missed.push(name);
}
restore();
console.log(`\nМУТАЦИОННЫЙ ТЕСТ: внесено ${cases.length} дефектов, поймано ${caught}`);
if(missed.length){console.log('НЕ ПОЙМАНЫ:');missed.forEach(m=>console.log('  -',m));process.exit(1);}
console.log('Контроль: после восстановления валидатор должен быть зелёным ->', run()===0?'ЗЕЛЁНЫЙ':'КРАСНЫЙ');
