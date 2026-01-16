window.$ = window.jQuery = require('./js/jquery-3.6.0.min.js');
(function ($) {
  $.fn.replaceClass = function (from_class, to_class) {
    return this.removeClass(from_class).addClass(to_class);
  };
}(jQuery));

//--------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const { execSync } = require('child_process');
const { shell } = require('electron');

const git = require("isomorphic-git");
const http = require("isomorphic-git/http/node");

const { Blob } = require('buffer');
const { ZipReader, ZipWriter, BlobReader, BlobWriter } = require('@zip.js/zip.js');

//--------------------------------------------------------------

class my_conf {
  config = {}
  
  constructor(database) {
    this.config_file = path.join(database,'config.zip');
  }
  
  existsSync() {
    return fs.existsSync(this.config_file)
  }
  
  async master(key) {
    if(!key) return { error: 'Password is empty' };
    return await this.save({ master: key, github: { user: "", repo: "", token: "" } })
  }
  
  async auth(key) {
    if(!key) return { error: 'Password is empty' };
    var z = new my_zip(key);
    var x = await z.unzip(this.config_file,0,true);
    if(!x.error) this.config = x;
    return x
  }
  
  keyup(e,cb) {
    const $input = $(e.target);
    $('#auth_error').html('Type it to open database ('+$input.val().length+')')
    if (e.key === "Enter" || e.keyCode === 13) cb();
  }
  
  async save(obj) {
    if(obj) Object.assign(this.config, obj);
    var z = new my_zip(this.config.master);
    var x = await z.zip(this.config,this.config_file,true);
    return x;
  }
}

//--------------------------------------------------------------

class my_backup {
  dir = []
  
  constructor(dirname) {
    this.src = path.join(dirname,'documents');
    if(!fs.existsSync(this.src)) fs.mkdirSync(this.src);

    this.dst = path.join(dirname,'database','backup');
    if(!fs.existsSync(this.dst)) fs.mkdirSync(this.dst);

    this.index_file = path.join(this.src,'index.json');
    
    $('#backup_src').html(this.src);
    $('#backup_dst').html(this.dst);
    
    var data = [];
    this.index().forEach(e => {
      if(fs.existsSync(path.join(this.src,e.file))) data.push(e)
    });
    fs.writeFileSync(this.index_file,JSON.stringify(data, null, 2));
  }
  
  mkdir(x) {
    fs.mkdirSync(this[x]);
    $(`#${x}_btn`).hide();
    this.update()
  }
  
  read_dir(p) {
    var z = new my_zip(C.config.master);
    var result = [];
    
    fs.readdirSync(p).forEach(name => {
      var fp = path.join(p, name);
      var stats = fs.statSync(fp);
      
      if (stats.isDirectory()) result.push({ name, type: 'folder', children: this.read_dir(fp) });
      else result.push({ name , zip: name.endsWith('.zip') ? z.code_fname(name): name, type: 'file', time: Math.floor(stats.mtimeMs / 1000) });
    });
    
    result.sort((a, b) => {
      if (a.type === b.type) return 0;
      if (a.type === 'folder') return -1;
      return 1;
    });
     return result;
  }
  
  update(p) {
    var t1 = fs.existsSync(this.src);
    var t2 = fs.existsSync(this.dst);
    
    $('#backup_list').empty();
    if(t1 && t2) {
      var src = this.read_dir(this.src);
      var dst = this.read_dir(this.dst);

      var index = this.index();
      
      if(p) {
        if(p == '..') this.dir.length = this.dir.length - 1;
        else this.dir.push(p);
      }
      $('#backup_header').html('.\\'+this.dir.join('\\'));
      
      if(this.dir.length) {
        var t1 = `<td style="cursor: pointer;" onclick="B.update('..')"><i class="bi bi-folder"></i>&nbsp;..</td>`;
        $('#backup_list').append(`<tr>${t1}<td></td><td></td>'}<td></td><td></td></tr>`)
      }
      
      this.dir.forEach(e => {
        var t = src.some(s => {
          if(s.type == 'folder' && s.name == e) {
            src = s.children; return true
          }
        })
        if(!t) src = [];
        
        var t = dst.some(s => {
          if(s.type == 'folder' && s.name == e) {
            dst = s.children; return true
          }
        })
        if(!t) dst = [];
      });
      
      src.some(sf => {
        if(sf.type == 'file') return true
        var x = dst.filter(df => df.name == sf.name && df.type == 'folder')[0];
        var t1 = `<td style="cursor: pointer;" onclick="B.update('${sf.name}')"><i class="bi bi-folder"></i>&nbsp;${sf.name}</td>`;
        $('#backup_list').append(`<tr>${t1}${x ? t1 : '<td></td>'}<td></td><td></td></tr>`)
      });
      
      dst.filter(df => {
        if(df.type == 'file') return true
        var x = src.filter(sf => sf.name == df.name && sf.type == 'folder')[0];
        if(!x) {
          var t2 = `<td style="cursor: pointer;" onclick="B.update('${df.name}')"><i class="bi bi-folder"></i>&nbsp;${df.name}</td>`;
          var delete_btn = `<button class="btn btn-danger btn-sm" onclick="B.delete('${df.name}')"><i class="bi bi-trash"></i></btn>`
          $('#backup_list').append(`<tr><td></td>${t2}<td>${delete_btn}</td><td></td></tr>`)
        }
      });

      src.some(sf => {
        if(sf.type == 'file') {
          var df = dst.filter(df => df.zip == sf.name+'.zip' && df.type == 'file')[0];
          
          var x = path.join(this.dir.join('\\'),sf.name);
          x = index.filter(e => e.file == x)[0];
          var link = `<span class="${x ? 'text-primary': ''}" style="cursor: pointer;" onclick="B.open('${sf.name}')">${sf.name}</span>`;

          var t1 = `<td><i class="bi bi-file${sf.name.endsWith('.zip') ? '-zip' : ''}"></i>&nbsp;${link}</td>`;
          var t2 = df ? `<td><i class="bi bi-file${df.name.endsWith('.zip') ? '-zip' : ''}"></i>&nbsp;${df.zip}</td>` : '<td></td>';
          var backup_btn = '';
          if(!df || sf.time > df.time) backup_btn = `<button class="btn btn-primary btn-sm" onclick="B.backup('${sf.name}')"><i class="bi bi-database-up"></i></btn>`;
          var restore_btn = '';
          if(df && sf.time > df.time) restore_btn = `<button class="btn btn-secondary btn-sm" onclick="B.restore('${df.name}')"><i class="bi bi-bootstrap-reboot"></btn>`;
          $('#backup_list').append(`<tr>${t1}${t2}<td>${backup_btn}</td><td>${restore_btn}</td></tr>`)
        }
      })
      
      dst.filter(df => {
        if(df.type == 'file') {
          var sf = src.filter(sf => df.zip == sf.name+'.zip' && sf.type == 'file')[0];
          if(!sf) {
            var t2 = `<td><i class="bi bi-file${df.name.endsWith('.zip') ? '-zip' : ''}"></i>&nbsp;${df.zip}</td>`;
            var restore_btn = `<button class="btn btn-secondary btn-sm" onclick="B.restore('${df.name}')"><i class="bi bi-bootstrap-reboot"></btn>`;
            var delete_btn = `<button class="btn btn-danger btn-sm" onclick="B.delete('${df.name}')"><i class="bi bi-trash"></i></btn>`
            $('#backup_list').append(`<tr><td></td>${t2}<td>${delete_btn}</td><td>${restore_btn}</td></tr>`)
          }
        }
      })
    }
  }
  
  index(file,text) {
    var data = [];
    if(fs.existsSync(this.index_file)) data = JSON.parse(fs.readFileSync(this.index_file, 'utf8'));
    
    if(!file) return data;
    if(text != undefined) {
      var x = text == "" || text == "<br>" || text == "...";
      var t = data.some((e,i) => {
        if(e.file == file) {
          if(x) data.splice(i, 1);
          else e.text = text;
          return true
        }
      });
      if(!t && !x) data.push({file, text});
      fs.writeFileSync(this.index_file,JSON.stringify(data, null, 2));
    }
    else {
      var x = data.filter(e => e.file == file)[0];
      if(x) return x.text
      return ""
    }
  }
  
  open(file) {
    this.dir.push(file);
    $('#backup_header').html('.\\'+this.dir.join('\\'));
    var text = this.index(this.dir.join('\\'));
    $('#backup_list').empty();
    $('#backup_list').append(`<tr><td colspan="4"><div id="backup_text" contenteditable="true" class="editable text-primary">${text ? text : '...'}</div></td></tr>`);
    $('#backup_list').append(`<tr><td colspan="4"><button class="btn btn-primary" onclick="B.save()">Save &amp; exit</button></td></tr>`);
    $('#backup_thead').hide();
  }
  
  save() {
    var text = $('#backup_text').html();
    this.index(this.dir.join('\\'),text);
    $('#backup_thead').show();
    this.update('..')
  }
  
  async backup(file) {
    var filePath = path.join(this.src,this.dir.join('\\'),file);
    var zipPath = path.join(this.dst,this.dir.join('\\'),file+'.zip');
    var z = new my_zip(C.config.master);
    console.log(await z.zip(filePath,zipPath));
    this.update();
  }
  
  async restore(file) {
    var zipPath = path.join(this.dst,this.dir.join('\\'),file);
    var outputDir = path.join(this.src,this.dir.join('\\'));
    var z = new my_zip(C.config.master);
    console.log(await z.unzip(zipPath,outputDir));

    const newMtime = Math.floor(Date.now() / 1000); 
    const stats = fs.statSync(zipPath);
    const currentAtime = stats.atimeMs / 1000;
    fs.utimesSync(zipPath, currentAtime, newMtime);

    this.update();
  }
  
  delete(file) {
    var filePath = path.join(this.dst,this.dir.join('\\'),file);
    if(fs.existsSync(filePath)) {
      var stat = fs.lstatSync(filePath);
      if (stat.isDirectory()) fs.rmSync(filePath, { recursive: true, force: true });
      else if (stat.isFile()) fs.unlinkSync(filePath);
      this.update();
    }
  }
}

//--------------------------------------------------------------

class my_git {
  constructor(database) {
    this.database = database;
  }
  
  init(obj) {
    Object.assign(this,obj);
    this.url = `https://github.com/${obj.user}/${obj.repo}.git`;
  }
  
  async clone() {
    try {
      await git.clone({
        fs,
        http,
        dir: this.database,
        url: this.url,
        singleBranch: true,
        depth: 1,
        onAuth: () => ({ username: this.token }),
      });
      return { result: "Clone completed: "+this.database };
    } catch (err) {
      return { error: err.message };
    }
  }
  
  async commit(message) {
    try {
      await git.commit({
        fs, dir: this.database, message,
        author: { name: this.user, email: 'you@example.com' },
      });
      
      return {}
    } catch (err) {
      return { 'error' :err.message };
    }
  }
  
  async push(file) {
    var dir = this.database;
    
    try {
      await git.add({ fs, dir, filepath: file ? file : '.' });
      
      var t = await this.commit('database update');
      
      if(t.error) return t
      
      await git.push({
        fs,
        http,
        dir,
        remote: 'origin',
        url: this.url,
        force: true,
        onAuth: () => ({
          username: this.user,
          password: this.token,
        }),
      });
      
      return await this.status();;
    } catch (err) {
      return { 'error' :err.message };
    }
  }
  
  async delete(list) {
    var dir = this.database;
    
    try {
      for (const file of list) {
        await git.remove({ fs, dir, filepath: file });
      }
      var t = await this.commit('delete files');
      if(t.error) return t
      return await this.status();
    } catch (err) {
      return { 'error' :err.message };
    }
  }
  
  async restore(list) {
    var dir = this.database;
    
    try {
      for (const file of list) {
        const content = await git.readBlob({ fs, dir, oid: await git.resolveRef({ fs, dir, ref: 'HEAD' }), filepath: file });
        const buffer = Buffer.from(content.blob);
        
        const fullPath = path.join(dir, file);
        const folder = path.dirname(fullPath);
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(fullPath, buffer);
      }
      return await this.status();
    } catch (err) {
      return { 'error' :err.message };
    }
  }
  
  async status() {
    try {
      const matrix = await git.statusMatrix({ fs, dir: this.database });
    
      var result = { changed: [], deleted: [] };
    
      for (const [name, head, workdir, stage] of matrix) {
        let status = '';
        if (head === 0 && workdir === 1 && stage === 0) status = 'Untracked';
        else if (head === 1 && workdir === 0) result.deleted.push(name);
        else if (head === 1 && workdir === 1 && stage === 0) status = 'Modified';
        else if (head === 1 && workdir === 1 && stage === 1) status = 'Staged';
        else if (head === 0 && workdir === 0 && stage === 1) status = 'Added';
        else result.changed.push(name);
      }

      return result
    } catch (err) {
      return { 'error' :err.message };
    }
  }
}

//--------------------------------------------------------------

class my_zip {
  ABC = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  constructor(key) {
    this.key = key;
  } 
  
  fname_code(x) {
    const ABC_LEN = this.ABC.length;
    const shift = this.key.length % ABC_LEN;

    var dir = path.dirname(x);
    var ext = path.extname(x);
    var base = path.basename(x, ext);
    
    let out = "";
    for (const ch of base) {
      const i = this.ABC.indexOf(ch);
      if (i === -1) out += ch;
      else out += this.ABC[(i + shift) % ABC_LEN];
    }
    return path.join(dir,out+ext);
  }
  
  code_fname(x) {
    const ABC_LEN = this.ABC.length;
    const shift = this.key.length % ABC_LEN;

    var dir = path.dirname(x);
    var ext = path.extname(x);
    var base = path.basename(x, ext);

    let out = "";
    for (const ch of base) {
      const i = this.ABC.indexOf(ch);
      if (i === -1) out += ch;
      else out += this.ABC[(i - shift + ABC_LEN) % ABC_LEN];
    }
    return path.join(dir,out+ext);
  }

  async zip(src, zipPath, conf = false) {
    try {
      let data;
      let fname;
      
      if (typeof src === 'string') {
        if (!fs.existsSync(src)) return { error: `Source file not found: ${src}` };
        data = fs.readFileSync(src);
        fname = path.basename(src);
      }
      else {
        const json = JSON.stringify(src, null, 2);
        data = Buffer.from(json, 'utf8');
        
        fname = path.basename(zipPath).replace(/\.zip$/i, '.json');
      }
      
      const writer = new ZipWriter(new BlobWriter("application/zip"), {
        password: this.key,
        encryptionStrength: 3 // AES-256
      });
      
      await writer.add(conf ? fname : this.fname_code(fname), new BlobReader(new Blob([data])));
      const blob = await writer.close();
      
      const buffer = Buffer.from(await blob.arrayBuffer());
      
      fs.mkdirSync(path.dirname(zipPath), { recursive: true });
      fs.writeFileSync(conf ? zipPath : this.fname_code(zipPath), buffer);
      
      return {
        result: `zip created: ${zipPath} (${buffer.length} bytes)`
      };
      
    } catch (err) {
      return { error: err.message };
    }
  }
  
  async unzip(zipPath, outputDir, conf = false) {
    try {
      const zipData = fs.readFileSync(zipPath);
  
      const reader = new ZipReader(
        new BlobReader(new Blob([zipData])),
        { password: this.key }
      );
  
      const entries = await reader.getEntries();
  
      let result = null;
  
      for (const entry of entries) {
        if (entry.directory) continue;
  
        const blob = await entry.getData(new BlobWriter());
        const buffer = Buffer.from(await blob.arrayBuffer());
        const fname = conf ? entry.filename : this.code_fname(entry.filename);
        const isJson = fname.toLowerCase().endsWith('.json');

        if (outputDir) {
          const outPath = path.join(outputDir, fname);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, buffer);
          result = { result: `unzip completed: ${outPath}` };
        }
        else if (isJson) result = JSON.parse(buffer.toString('utf8'));
        else return { error: `Cannot unzip file ${fname} without outputDir` };
      }
  
      await reader.close();
      return result;
  
    } catch (err) {
      return { error: err.message };
    }
  }
}

//--------------------------------------------------------------

class page {
  config = {}
  
  constructor() {
    this._dir = __dirname.endsWith('app.asar') ? __dirname.split('\\').reverse().filter((x,i) => i > 1).reverse().join('\\') : __dirname;
    this.database = path.join(this._dir,'database');
    if(!fs.existsSync(this.database)) fs.mkdirSync(this.database);
  }
  
  async login(x) {
    if(x == 'm') {
      var t = await C.master($(`#master_key`).val());
      if(t.error) console.log(t)
      else {
        $('#master').hide(); $('#main').show();
        P.list('');
      }
    }

    if(x == 'a') {
      var t = await C.auth($(`#auth_key`).val());
      if(t.error) $('#auth_error').html(t.error)
      else {
        $('#auth').hide(); $('#main').show();
        var gh = C.config.github;
        if(gh) {
          $('#git_user').val(gh.user);
          $('#git_repo').val(gh.repo);
          $('#git_token').val(gh.token);
        }
        P.list('');
      }
    }
  }
  
  new_folder() {
    var f = $('#new_folder').val(); if(!f) return;
    var arr = ($('#header').html()+'\\'+f).split('\\'); arr[0] = this._dir;
    var fullPath = path.join(...arr);
    if(fs.existsSync(fullPath)) return;
    fs.mkdirSync(fullPath);
    this.list('.')
  }
  
  new_file() {
    var f = $('#new_file').val(); if(!f) return;
    var arr = ($('#header').html()+'\\'+f+'.zip').split('\\'); arr[0] = this._dir; 
    var file = path.join(...arr);
    if(fs.existsSync(file)) return;
    this.current = []
    this.save(file);
    this.list('.')
  }
  
  async delete(name) {
    var confirmed = await this.ask(`Are you sure you want to delete?`);
    if (!confirmed) return

    this.dir.some(e => {
      if(e.name = name) {
        var arr = ($('#header').html()).split('\\'); arr[0] = this._dir; arr.push(name);
        var fullPath = path.join(...arr);
        if (fs.existsSync(fullPath)) {
          var stat = fs.lstatSync(fullPath);
          if (stat.isDirectory()) fs.rmSync(fullPath, { recursive: true, force: true });
          else if (stat.isFile()) fs.unlinkSync(fullPath);
        }
        return true
      }
    })
    this.list('.')
  }
  
  pm(tag) {
    if(tag) this.current = this.current.filter(e => e.tag != tag);
    else {
      var tag = $('#new_tag').val();
      var val = $('#new_val').val();
      var t = this.current.filter(e => e.tag == tag)[0]
      if(!tag || t) return
      this.current.push({ tag, val });
    }
    this.update()
  }
  
  up(tag) {
    const i = this.current.findIndex(e => e.tag === tag);
    if (i > 0) [this.current[i - 1], this.current[i]] = [this.current[i], this.current[i - 1]];
    this.update()
  }
  
  hide(tag) {
    this.current.some(e => {
      if(e.tag == tag) {
        e.hide = e.hide ? false : true;
        return true
      }
    });
    this.update()
  }
  
  copy(tag) {
    var text = this.current.filter(e => e.tag == tag)[0].val
    navigator.clipboard.writeText(text);
  }
  
  keyup(tag,x) {
    this.current.some(e => {
      if(e.tag == tag) {
        if ($(x).is('div')) e.val = $(x).html()
        else e.val = $(x).val()
        return true
      }
    });
  }
  
  checkbox(tag) {
    this.current.some(e => {
      if(e.tag == tag) {
        e.txt = e.txt ? false : true
        return true
      }
    });
    this.update()
  }
  
  async load() {
    var z = new my_zip(C.config.master);
    
    var arr = $('#header').html().split('\\'); arr[0] = this._dir;

    var t1 = arr[arr.length-1] == 'config.zip';
    var t2 = arr[arr.length-2] == 'database';

    if(!(t1 && t2)) arr[arr.length-1] = z.fname_code(arr[arr.length-1]);
    var file = path.join(...arr);
    var x = await z.unzip(file,0,t1 && t2);
    
    if(!x.error) this.current = x
    else this.list('..');
  }
  
  async save(file) {
    var t = file;
    if(t) this.current = [];
    else {
      var arr = $('#header').html().split('\\'); arr[0] = this._dir;
      file = path.join(...arr);
    }
    
    var z = new my_zip(C.config.master);
    await z.zip(this.current,file);

    if(t) this.list('.');
    else this.list('..');
  }
  
  read_dir(p) {
    if(!p) p = this.database;
    
    var result = [];
    
    fs.readdirSync(p).forEach(name => {
      if (['.git','git','backup'].includes(name)) return;
      var fp = path.join(p, name);
      if (fs.statSync(fp).isDirectory()) result.push({ name, type: 'folder', children: this.read_dir(fp) });
      else result.push({ name , type: 'file' });
    });
    
    result.sort((a, b) => {
      if (a.type === b.type) return 0;
      if (a.type === 'folder') return -1;
      return 1;
    });
    
    return result;
  }
  
  list(item) {
    var dir = false, z = new my_zip(C.config.master);;
    if(item == '') {
      $('#header').html('.\\database');
      this.dir = this.read_dir();
      dir = true
    }
    else if(item == '.') {
      var x = $('#header').html().split('\\'); x.shift(); x[0] = '';
      for(var e of x) this.list(e)
      return
    }
    else if(item == '..') {
      var x = $('#header').html().split('\\').slice(0, -1); x.shift(); x[0] = '';
      for(var e of x) this.list(e)
      return
    }
    else {
      var t1 = !item.endsWith('.zip');
      var t2 = item == 'config.zip' && $('#header').html() == '.\\database';
      $('#header').append('\\'+(t1 || t2 ? item : z.code_fname(item)));
      this.dir.some(e => {
        if(e.name == item) {
          if(e.children) {
            this.dir = e.children;
            dir = true
          }
          return true
        }
      })
    }
    
    $('#list').empty();
    var h = $('#header').html();
    if(h.endsWith('.zip')){
      var template = `<td><div class="d-flex justify-content-end"><i class="bi bi-x" style="cursor: pointer;" onclick="P.list('..')"></i></div></td>`
      $('#list').append(`<tr>${template}</tr>`)
    }
    else if(h != '.\\database') {
      var template = `<td style="cursor: pointer;" onclick="P.list('..')"><i class="bi bi-folder"></i>&nbsp;..</td><td></td>`
      $('#list').append(`<tr>${template}</tr>`)
    }
    
    if(dir) {
      this.dir.forEach(e => {

        var name = e.name, zip_test = e.name.endsWith('.zip');
        if(zip_test) {
          name = h ==  '.\\database' && name =='config.zip' ? name : z.code_fname(name);
        }

        if(e.type == 'folder' || zip_test) {
          var template = `<td style="cursor: pointer;" onclick="P.list('${e.name}')"><i class="bi bi-${e.type == 'folder' ? 'folder': 'file-zip'}"></i>&nbsp;${name}</td>`
          if(item == '' && name == 'config.zip') template += `<td></td>`
          else template += `<td><button class="btn btn-danger btn-sm" onclick="P.delete('${e.name}')"><i class="bi bi-trash"></i></botton></td>`
        }
        else {
          var template = `<td><i class="bi bi-file"></i>&nbsp;${name}</td>`
          template += `<td></td>`
        }
        $('#list').append(`<tr>${template}</tr>`)
      })
    }
    else {          
      $('#list').append(`<tr><td id="card"></td></tr>`);
      this.load().then(() => this.update());
    }
  }
  
  update() {
    if (!Array.isArray(this.current)) return $('#card').html(`<pre>${JSON.stringify(this.current, null, 2)}</pre>`);
    
    var card = `<table class="table"><tbody>`;
    this.current.forEach((e,i) => {
      var line = '<td>'
      if(i) line += `<button type="button" class="btn btn-secondary btn-sm" onclick="P.up('${e.tag}')"><i class="bi bi-arrow-up"></i></button>`
      line += '</td>'
      line += `<td><button type="button" class="btn btn-danger btn-sm" onclick="P.pm('${e.tag}')"><i class="bi bi-x"></i></button></td>`;
      if(e.txt) {
        line += `<td colspan=4>`
        line += `<p><strong>${e.tag}</strong></p>`
        line += `<div contenteditable="true" class="editable text-primary" onkeyup="P.keyup('${e.tag}',this)">${e.val}</div>`
        line += `</td>`
      }
      else {
        line += `<td>${e.tag}</td>`;
        line += `<td><input type="${e.hide ? 'password' : 'text'}" class="form-control" value="${e.val}" onkeyup="P.keyup('${e.tag}',this)"></td>`
        line += `<td><button type="button" class="btn btn-secondary btn-sm"><i class="bi bi-eye${e.hide ? '-slash': ''}" onclick="P.hide('${e.tag}')"></i></button></td>`
        line += `<td><button type="button" class="btn btn-secondary btn-sm"><i class="bi bi-files" onclick="P.copy('${e.tag}')"></i></button></td>`
      }
      line += `<td><div class="form-check"><input class="form-check-input" type="checkbox" onclick="P.checkbox('${e.tag}')" ${e.txt ? 'checked' : ''}><label class="form-check-label" for="check1">txt</label></div></td>`
      card += `<tr ${e.txt ? '' : 'style="vertical-align: middle"'}>${line}</tr>`;
    });
    var line = `<td></td><td><button type="button" class="btn btn-success btn-sm" onclick="P.pm()"><i class="bi bi-plus"></i></button></td>`;
    line += `<td><input type="text" class="form-control" id="new_tag" placeholder="tag"></td>`;
    line += `<td><input type="text" class="form-control" id="new_val" placeholder="val"></td>`;
    line += `<td colspan=3></td>`
    card += `<tr style="vertical-align: middle">${line}</tr>`;
    card += `</tbody></table>`;
    card += `<button id="save" class="btn btn-primary" onclick="P.save()">Save &amp; exit</button>`
    $('#card').html(card)
  }
  
  nav(e) {
    var x = $(e).html().toLowerCase();
    $('.nav-link').removeClass('active');
    if(x == 'home' || x == 'about') $(e).addClass('active');
    if(x == 'home') this.list('')
    if(x == 'backup') B.update();
    $('.nav').hide();
    $('#'+x).show();
  }
  
  async git(x) {
    var t = 0, str = "";
    
    var obj = {
      user: $('#git_user').val(),
      repo: $('#git_repo').val(),
      token: $('#git_token').val()
    }
    
    if(!obj.user) return $('#git_code').html('User is missing!');
    if(!obj.repo) return $('#git_code').html('Repository is missing!');
    if(!obj.token) return $('#git_code').html('Token is missing!');
    
    G.init(obj);
    
    var a = JSON.stringify(obj);
    var b = JSON.stringify(C.config.github);
    if(a != b) C.save({ github: obj });
    
    if(x == 'clone') {
      var confirmed = await this.ask(`All data in the database folder will be deleted. Are you sure you want to proceed?`);
      if (confirmed) {
        fs.rmSync(P.database, { recursive: true, force: true });
        fs.mkdirSync(P.database);
        str = 'All files and folders in the database folder have been deleted.<br>'
        str += JSON.stringify(await G.clone());
      
        if(!C.existsSync()) { C.save(); str += `<br>config.zip - restored` }
      }
    }
    
    if(x == 'push') {
      var str = await G.status();
      if(str.error) t = str
      else {
        if(!str.changed.length) str = 'Nothing to commit'
        else {
          t = await G.push();
          if(!t.error) str = 'Push completed'
        }
      }
    }
    
    if(x == 'remove') {
      t = await G.status();
      if(t.error) str = t
      else if(!t.deleted.length) str = 'Nothing to delete'
      else {
        t = await G.delete(t.deleted);
        if(!t.error) str = 'Delete completed'
      }
    }
    
    if(x == 'status') {
      t = await G.status();
      if(!t.error) str = `Changed files: ${t.changed.length}<br>Deleted files: ${t.deleted.length}`
    }
    
    if(t) {
      if(t.error) str = JSON.stringify(t)
      else this.git_list(t)
    }
    $('#git_code').html(str);
  }
  
  async git_list(x,c) {
    var z = new my_zip(C.config.master);

    if(c) {
      var t = {}
      if(c == 'restore') t = await G.restore([x]);
      if(c == 'delete') t = await G.delete([x]);
      if(c == 'push') t = await G.push(x);
      if(t.error) $('#git_code').html(JSON.stringify(t))
      else this.git_list(t);
      return
    }

    $('#git_code').html(`Changed files: ${x.changed.length}<br>Deleted files: ${x.deleted.length}`)
    $('#git_list').empty();
    x.changed.forEach(e => {
      var name = e.endsWith('.zip') && e != 'config.zip' ? z.code_fname(e) : e;
      $('#git_list').append(`<tr>
        <td>${name}</td><td class="text-primary">changed</td>
        <td><button class="btn btn-primary btn-sm" onclick="P.git_list('${e}','push')"><i class="bi bi-send"></i></botton></td>
        <td><button class="btn btn-secondary btn-sm" onclick="P.git_list('${e}','restore')"><i class="bi bi-bootstrap-reboot"></i></botton></td>
      </tr>`)
    });
    x.deleted.forEach(e => {
      var name = e.endsWith('.zip') && e != 'config.zip' ? z.code_fname(e) : e;
      $('#git_list').append(`<tr>
        <td>${name}</td><td class="text-danger">deleted</td>
        <td><button class="btn btn-danger btn-sm" onclick="P.git_list('${e}','delete')"><i class="bi bi-trash"></i></botton></td>
        <td><button class="btn btn-secondary btn-sm" onclick="P.git_list('${e}','restore')"><i class="bi bi-bootstrap-reboot"></i></botton></td>
      </tr>`)
    })
  }
  
  exec(cmd,cwd) {
    try {
      return execSync(cmd, { cwd: cwd ? cwd : this._dir, encoding: 'utf-8' });
    } catch (error) {
      var x = `Error: ${error.message}`
      console.log(x); return x
    }
  }
  
  open(link) {
    shell.openExternal(link);
  }
  
  ask(message) {
    const modalElement = document.getElementById('bootstrapConfirm');
    const modal = new bootstrap.Modal(modalElement);
    
    const messageElement = document.getElementById('bootstrapModalMessage');
    const okBtn = document.getElementById('btnOk');
    const cancelBtn = document.getElementById('btnCancel');
  
    messageElement.textContent = message;
    modal.show();
  
    return new Promise((resolve) => {
      okBtn.onclick = () => { modal.hide(); resolve(true) };
      cancelBtn.onclick = () => { modal.hide(); resolve(false) };
      modalElement.addEventListener('hidden.bs.modal', () => { resolve(false) }, { once: true }); 
    });
  }
}

var P = new page();

var C = new my_conf(P.database);
if(C.existsSync()) $('#auth').show()
else $('#master').show();

var G = new my_git(P.database);

var B = new my_backup(P._dir)
