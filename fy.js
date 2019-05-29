var packageJson = require('./package.json')

var request = require('request');
var fs = require('fs');
var crypto = require('crypto');
var colors = require( "colors");
var program = require('commander');
var child_process = require('child_process');

const WORD_LIST_FILE = './.word-list.json';
const WORD_LIST_FILE_SYNC = './word-list.json';

program
  .version(packageJson.version)
  .usage('[word] [Options]')
  .option('-j, --json', 'Show the response json.')
  .option('-l, --list', 'Show the list of word.')
  .option('-s, --sync', 'Sync the word list to git.')
  .option('-d, --delete [word]', 'Delete a word from the list.')
  .option('-q, --quiet', 'If there is -q/--quiet or env.FY_QUIET=true, then no sound.')
  .option('--oneline', 'If there is --oneline or env.FY_ONELINE=true, then will show the result in one line.')
  .parse(process.argv);

if (program.list) {
    showWordList();
} else if (program.sync) {
    syncWordList();
} else if (program.delete) {
    if (program.delete === true) {
        deleteWord(program.args.join(' ').toLowerCase());
    } else {
        deleteWord(program.delete);
    }
} else {
    queryWord(program.args.join(' ').toLowerCase(), {
        noSound: program.quiet || process.env.FY_QUIET === 'true',
        oneLine: program.oneline || process.env.FY_ONELINE === 'true'
    });
}

function queryWord(query, options) {
    var appKey = process.env.FY_API_YOUDAO_APP_KEY;
    var key = process.env.FY_API_YOUDAO_KEY;
    var salt = (new Date).getTime();
    var from = '';
    var to = '';
    var str1 = appKey + query + salt + key;
    var sign = md5(str1);
    var json = {
        q: query,
        appKey: appKey,
        salt: salt,
        from: from,
        to: to,
        sign: sign
    };
    var apiOptions = {
        method: 'POST',
        url: 'https://openapi.youdao.com/api',
        headers: {
            'Content-Type': 'application/json'
        },
        form: json,
        json: true
    };
    request(apiOptions, function (error, response, body) {
        if (error) throw new Error(error);
        if (program.json) console.log(body);
        var errorCode = body.errorCode; // 错误返回码: 一定存在
        var query = body.query; // 源语言: 查询正确时，一定存在
        var translation = body.translation; // 翻译结果: 查询正确时一定存在
        var basic = body.basic; // 词义: 基本词典,查词时才有
        var web = body.web; // 词义: 网络释义，该结果不一定存在
        var l = body.l; // 源语言和目标语言: 一定存在
        var dict = body.dict; // 词典deeplink: 查询语种为支持语言时，存在
        var webdict = body.webdict; // webdeeplink: 查询语种为支持语言时，存在
        var tSpeakUrl = body.tSpeakUrl; // 翻译结果发音地址: 翻译成功一定存在
        var speakUrl = body.speakUrl; // 源语言发音地址: 翻译成功一定存在

        if (errorCode !== '0') {
            console.log(JSON.stringify(body).red);
        } else {
            let showHistory = true;
            if (options.oneLine) {
                console.log(body.translation.join('; '), body.basic ? body.basic.explains.join('; ') : '');
                showHistory = false;
            } else {
                if (basic) {
                    console.log(('\n' + query + ': ').yellow + translation.join(', ') + (' [ ' + basic['phonetic'] + ' ]' + ', [ ' + basic['uk-phonetic'] + ' ]' + ', [ ' + basic['us-phonetic'] + ' ]').yellow,  webdict.url.gray, ((basic.exam_type || []).join(',')).gray);
                    let enSpeakUrl = l.toLowerCase() === 'en2zh-chs' ? speakUrl : tSpeakUrl;
                    console.log(enSpeakUrl.gray);
                    for (var i = 0; i < basic.explains.length; i++) {
                        console.log('    ' + basic.explains[i]);
                    }
                    setTimeout(() => {
                        options.noSound || soundByUrl(query, enSpeakUrl);
                    });
                } else {
                    console.log(('\n' + query + ': ').yellow, translation.join(', '),  ((webdict && webdict.url) || '').gray);
                }
            
                console.log();
            
                if (web) {
                    console.log();
                    for (var i = 0; i < web.length; i++) {
                        console.log('    ' + web[i].key + ': ' + web[i].value.join(', '));
                    }
                }
                console.log();
            }
            updateWordList(query, body, showHistory);
        }
    });
}

function updateWordList(word, result, showHistory) {
    var item;
    var wordList = readLocalWordList();

    for (var i = 0; i < wordList.length; i++) {
        if (word === wordList[i].word) {
            item = wordList[i];
            item.queryHistory.push(dateFormat(new Date(), 'yyyy-MM-dd hh:mm:ss'));
            break;
        }
    }
    if (!item) {
        item = {
            word: word,
            queryHistory: [dateFormat(new Date(), 'yyyy-MM-dd hh:mm:ss')],
            result: result
        };
        wordList.push(item);
    }
    showHistory && console.log(('Query history: ' + item.queryHistory.length), item.queryHistory.join(', ').gray);

    writeLocalWordList(wordList);
}

function writeLocalWordList(wordList) {
    writeWordList(wordList, WORD_LIST_FILE);
}

function writeSyncWordList(wordList) {
    writeWordList(wordList, WORD_LIST_FILE_SYNC);
}

function writeWordList(wordList, file) {
    fs.writeFileSync(file, JSON.stringify(wordList, null, 2));
}

function readLocalWordList() {
    return readWordList(WORD_LIST_FILE);
}
function readSyncWordList() {
    return readWordList(WORD_LIST_FILE_SYNC);
}

function readWordList(file) {
    var wordList = fs.readFileSync(file, 'utf8');
    wordList = wordList ? JSON.parse(wordList) : [];
    return wordList;
}


function showWordList() {
    var wordList = readLocalWordList();

    wordList = wordList.sort(function(a, b) {
        if (a.queryHistory.length === b.queryHistory.length) {
            return new Date(b.queryHistory[a.queryHistory.length - 1]).getTime() - new Date(a.queryHistory[b.queryHistory.length - 1]).getTime();
        }
        return b.queryHistory.length - a.queryHistory.length;
    });

    for (var i = 0; i < wordList.length; i++) {
        console.log(wordList[i].word.yellow, (wordList[i].queryHistory.length + '').gray, 
            wordList[i].result.translation.join('; '), wordList[i].result.basic ? wordList[i].result.basic.explains.join('; ').blue : '');
    }
    console.log(('List size: ' + wordList.length).gray);
}

function syncWordList() {

    execCommand('git pull', function(err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
    });

    // merge the .word-list.json to word-list.json
    var localWordList = readLocalWordList();
    var syncWordList = readSyncWordList();

    var syncWord, localWord;
    var syncWordMap = {};
    var i, len;
    for (i = 0, len = syncWordList.length; i < len; i++) {
        syncWord = syncWordList[i];
        syncWordMap[syncWord.word] = syncWord;
    }

    // TODO should merge the query history
    for (i = 0, len = localWordList.length; i < len; i++) {
        localWord = localWordList[i];
        if (!syncWordMap[localWord.word]) {
            syncWordList.push(localWord);
        }
    }
    writeSyncWordList(syncWordList);
    
    // copy the word-list.json to .word-list.json
    execCommand('cp ./word-list.json ./.word-list.json');

    // git push
    execCommand('git add ' + WORD_LIST_FILE_SYNC + ' && git commit -m "sync word list" && git push', function(err, stdout, stderr){
        console.log(stdout);
        console.log(stderr);
    });
}

function soundByUrl(word, url, isCached) {
    var cmdStr = 'curl \'' + url + '\' -o /tmp/' + word + '.mp3 && mpg123 /tmp/' + word + '.mp3';
    if (isCached) {
        cmdStr = 'mpg123 /tmp/' + word + '.mp3';
    }
    execCommand(cmdStr, function(err,stdout,stderr){
        // console.log(stdout);
        // console.log(stderr);
        soundByUrl(word, url, true);
    }, true);
}
/**
 * execute a shell command
 * @param {*} command shell command
 * @param {*} callback 
 * e.g: execCommand('echo "abc"', function(err, stdout, stoerr) {...});
 */
function execCommand(command, callback, quiet) {
    !quiet && console.log(command);
    // https://stackoverflow.com/questions/30134236/use-child-process-execsync-but-keep-output-in-console
    // TODO: this will not output any log, if there are any error then will not display
    child_process.execSync(command, quiet ? {stdio: 'ignore'} : {stdio: 'inherit'});
    callback && callback();
}

function deleteWord(word) {
    var wordList = readLocalWordList();
    var hasDeleted = false;
    for (var i = 0; i < wordList.length; i++) {
        if (wordList[i].word === word) {
            wordList.splice(i, 1);
            hasDeleted = true;
        }
    }
    writeLocalWordList(wordList);
    // showWordList();
    if (hasDeleted) {
        console.log('The "' + word + '" has been successfully deleted.');
    } else {
        console.log('Fail to delete the "' + word + '", because it could not be found.')
    }
}

function md5(str) {
    return crypto.createHash('md5').update(str).digest().toString('hex');
}

function dateFormat(date, fmt) {
    var o = {
        "M+": date.getMonth() + 1,
        "d+": date.getDate(),
        "h+": date.getHours(),
        "m+": date.getMinutes(),
        "s+": date.getSeconds(),
        "S": date.getMilliseconds()
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
}