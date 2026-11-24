import {rankLots} from './scoring.js';
import assert from 'node:assert/strict';
const lots={a:{name:'A'},b:{name:'B'}};const units={x:{lot:'a',online:true,occupied:false},y:{lot:'b',online:true,occupied:true},z:{lot:'b',online:false,occupied:false}};
const result=rankLots(lots,units);assert.equal(result[0].id,'a');assert.equal(result[0].counts.available,1);assert.equal(result[1].counts.available,0);console.log('Recommendation tests passed');
