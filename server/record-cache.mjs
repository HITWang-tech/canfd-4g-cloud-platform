export class RecordCache {
 constructor({maxRecords=50000,retentionMs=3600000,now=Date.now}={}) {
  if(!Number.isInteger(maxRecords)||maxRecords<1)throw Error('缓存条数必须为正整数');
  if(!Number.isFinite(retentionMs)||retentionMs<=0)throw Error('缓存保留时长必须大于零');
  this.maxRecords=maxRecords;this.retentionMs=retentionMs;this.now=now;
  this.records=[];this.expiredRecords=0;this.capacityEvictions=0;this.lastCleanupAt=null;
 }
 append(record) {
  this.records.push(record);
  const overflow=this.records.length-this.maxRecords;
  if(overflow>0){this.records.splice(0,overflow);this.capacityEvictions+=overflow;}
 }
 prune() {
  const now=this.now(),cutoff=now-this.retentionMs;
  let write=0;
  for(const record of this.records)if(record.receivedAt>=cutoff)this.records[write++]=record;
  const removed=this.records.length-write;this.records.length=write;
  this.expiredRecords+=removed;this.lastCleanupAt=now;return removed;
 }
 snapshot() {
  return {records:this.records.length,maxRecords:this.maxRecords,retentionSeconds:this.retentionMs/1000,expiredRecords:this.expiredRecords,capacityEvictions:this.capacityEvictions,lastCleanupAt:this.lastCleanupAt};
 }
}
