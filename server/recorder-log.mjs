import {createWriteStream} from 'node:fs';
import {mkdir,readdir,stat,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const DAY=86400000;
export const beijingDate=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
export class RecorderLog {
 constructor({directory,retentionDays=30,now=Date.now}) {
  if(!Number.isInteger(retentionDays)||retentionDays<1)throw Error('日志保留天数必须为正整数');
  this.directory=path.resolve(directory);this.retentionDays=retentionDays;this.now=now;
  this.writer=null;this.activeName=null;this.writers=new Set();this.closed=false;this.maintenance=null;
  this.errors=0;this.lastError=null;this.deletedFiles=0;this.lastCleanupAt=null;
  this.ready=this.initialize();
 }
 error(error){this.errors++;this.lastError=String(error.code||error.message||error).slice(0,160);}
 async initialize(){
  await mkdir(this.directory,{recursive:true});
  const legacy=path.join(this.directory,'records.ndjson');
  try {
   const entry=await stat(legacy);
   if(entry.isFile()){
    const stamp=new Date(this.now()).toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
    await rename(legacy,path.join(this.directory,`records-legacy-${stamp}-${randomUUID().replaceAll('-','')}.ndjson`));
   }
  }catch(error){if(error.code!=='ENOENT')throw error;}
  await this.cleanup();
 }
 append(record){
  if(this.closed)return null;
  const name=`records-${beijingDate(record.receivedAt)}.ndjson`;
  if(!this.writer||this.activeName!==name){
   if(this.writer)this.writer.end();
   const writer=createWriteStream(path.join(this.directory,name),{flags:'a',highWaterMark:256*1024});
   this.writer=writer;this.activeName=name;this.writers.add(writer);
   writer.on('error',error=>{this.error(error);if(this.writer===writer){this.writer=null;this.activeName=null;}});
   writer.on('close',()=>this.writers.delete(writer));
  }
  const writer=this.writer;
  writer.write(JSON.stringify(record)+'\n');return writer;
 }
 async cleanup(){
  if(this.maintenance)return this.maintenance;
  this.maintenance=this.cleanFiles();
  try{return await this.maintenance;}finally{this.maintenance=null;}
 }
 async cleanFiles(){
  const now=this.now(),cutoff=now-this.retentionDays*DAY;let deleted=0;
  for(const entry of await readdir(this.directory,{withFileTypes:true})){
   if(!entry.isFile())continue;
   const daily=entry.name.match(/^records-(\d{4}-\d{2}-\d{2})\.ndjson$/);
   const legacy=/^records-legacy-\d{8}T\d{6}Z-[a-f0-9]{32}\.ndjson$/.test(entry.name);
   if(!daily&&!legacy)continue;
   const filename=path.resolve(this.directory,entry.name);
   if(path.dirname(filename)!==this.directory)continue;
   try{
    const info=await stat(filename);
    if(daily){const start=Date.parse(daily[1]+'T00:00:00+08:00');if(!Number.isFinite(start)||beijingDate(start)!==daily[1]||start+DAY>cutoff)continue;}
    // Also check mtime: recently imported or modified archives are never removed early.
    if(info.mtimeMs>cutoff)continue;
    if(entry.name===this.activeName){const writer=this.writer;this.writer=null;this.activeName=null;await new Promise(resolve=>{if(writer.closed)return resolve();writer.once('close',resolve);writer.end();});}
    await unlink(filename);deleted++;
   }catch(error){if(error.code!=='ENOENT')this.error(error);}
  }
  this.deletedFiles+=deleted;this.lastCleanupAt=now;return deleted;
 }
 snapshot(){return {retentionDays:this.retentionDays,deletedFiles:this.deletedFiles,errors:this.errors,lastError:this.lastError,lastCleanupAt:this.lastCleanupAt,activeFile:this.activeName};}
 async close(){
  this.closed=true;await this.ready;if(this.maintenance)await this.maintenance;
  await Promise.all([...this.writers].map(writer=>new Promise(resolve=>{if(writer.closed)return resolve();writer.once('close',resolve);writer.end();})));
 }
}
