import assert from 'node:assert/strict';
import {unitState,lotSummary,rankLots} from './scoring.js';
assert.equal(unitState({online:true,occupied:false}),'available');
assert.equal(unitState({online:true,occupied:true}),'occupied');
assert.equal(unitState({online:false,occupied:false}),'offline');
assert.equal(unitState({occupied:false}),'offline');
assert.equal(unitState({online:true}),'unknown');
const lots={n:{name:'North',siteId:'a'},s:{name:'South',siteId:'a'},x:{name:'Other',siteId:'b'}};
const units={u1:{lot:'n',online:true,occupied:false},u2:{lot:'n',online:false,occupied:false},
u3:{lot:'s',online:true,occupied:false},u4:{lot:'s',online:true,occupied:false},
u5:{lot:'s',online:true,occupied:true},u6:{lot:'x',online:true,occupied:false}};
assert.deepEqual(lotSummary('n',units).counts,{available:1,occupied:0,offline:1,unknown:0});
const ranked=rankLots(lots,units,'a');
assert.equal(ranked.length,2);assert.equal(ranked[0].id,'s');
assert.equal(rankLots(lots,units,'b')[0].id,'x');
console.log('PASS: status, offline safety, lot assignment, site filter, recommendation');
