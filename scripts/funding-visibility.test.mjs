import test from 'node:test';import assert from 'node:assert/strict';
import {publishedFundingAssessments,fundingScoreLabel} from '../funding-visibility.mjs';
test('internal readiness drafts and uncompleted publication never become portal delivery',()=>{
 const published={id:1,status:'published',published_at:'2026-10-26T00:00:00Z',score:60};
 assert.deepEqual(publishedFundingAssessments([published,{id:2,status:'draft',published_at:null},{id:3,status:'reviewed',published_at:null},{id:4,status:'published',published_at:null}]),[published]);
 assert.equal(fundingScoreLabel({score:0,components:{score_supported:false}}),'Not supported');assert.equal(fundingScoreLabel(published),60);
});
