import test from 'node:test';
import assert from 'node:assert/strict';
import {actionableCloudSyncNotice,isRetryableCloudSyncFailure} from '../lib/cloud-sync-status.ts';

test('temporary network failures retry without interrupting study',()=>{
  assert.equal(isRetryableCloudSyncFailure({code:'network',message:'Failed to fetch'}),true);
  assert.equal(isRetryableCloudSyncFailure({status:503,message:'Service unavailable'}),true);
  assert.equal(actionableCloudSyncNotice([
    {area:'history',reason:{code:'network'}},
    {area:'vocabulary',reason:new TypeError('Failed to fetch')},
  ]),null);
});

test('non-retryable cloud failures still produce one actionable notice',()=>{
  assert.equal(isRetryableCloudSyncFailure({code:'42501',message:'permission denied'}),false);
  assert.equal(actionableCloudSyncNotice([
    {area:'history',reason:{code:'42501',message:'permission denied'}},
    {area:'history',reason:{code:'42501',message:'permission denied'}},
  ]),'History cloud sync needs attention. Local progress is safe on this device.');
});

test('retryable failures do not hide a simultaneous permanent failure',()=>{
  assert.equal(actionableCloudSyncNotice([
    {area:'history',reason:{code:'network'}},
    {area:'vocabulary',reason:{code:'42P01',message:'relation does not exist'}},
  ]),'Shared vocabulary cloud sync needs attention. Local progress is safe on this device.');
});
