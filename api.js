var phantom = require('phantom');
var cheerio = require('cheerio');
var http = require('http');
var URL  = require('url');

var DEPOSIT = 25.00; // いくら入れたかは自己申告
var PORT = 3002; // このサーバーが待ち受けるポート


var frontObj = {
	deposit: DEPOSIT,
	difference: '',
	totalDifference: '',
	balance: DEPOSIT,
	beforeBalance: DEPOSIT,
	text: ''
};

config = {};
config.exitFlag = false;


http.createServer(function (req, res) {
	if(req.method == 'GET') {
		sendResponseToFront(req, res); // フロント部にレスポンスを返している。
	}

}).listen(PORT);
console.log('this server is listening port: ' + PORT);

getBalance = function() {
	config.exitFlag = true;

	phantom.create(function(ph) {
		ph.createPage(function(page) {

			// ページが読み込まれたら page.onCallback を呼ぶ
			page.set('onInitialized', function() {
				page.evaluate(function() {
					document.addEventListener('DOMContentLoaded', function() {
						window.callPhantom('DOMContentLoaded');
					}, false);
				});
			});

			// ページが読み込まれたら登録した関数の配列を順次実行してくれるクラス
			var funcs = function(funcs) {
				this.funcs = funcs;
				this.init();
			};
			funcs.prototype = {
				// ページが読み込まれたら next() を呼ぶ
				init: function() {
					var self = this;
					page.set('onCallback', function(data) {
						if (data === 'DOMContentLoaded') self.next();
					});
				},
				// 登録した関数の配列から１個取り出して実行
				next: function() {
					var func = this.funcs.shift();
					if (func !== undefined) {
						func();
					} else {
						page.set('onCallback', undefined);
					}
				}
			};

			// 順次実行する関数
			new funcs([
				function() {
					// evaluateが返ってこなくなったときに処理を止めるsetTimeout
					setTimeout(function() {
						if (config.exitFlag){
							console.log('exit this time');
							ph.exit();
						}
					}, 1*60*1000);
					page.open('https://accounts.pkr.com/LogOn.aspx?RedirectUrl=https://accounts.pkr.com/default.aspx'); // ログインページヘ
				},
				function() {
					console.log('trying login....');
					setTimeout(function() {
						page.evaluate(function() {
							document.getElementById('_ctl0_txtUserName').value = 'name';
							document.getElementById('_ctl0_txtPassword').value = 'pass';
							document.getElementById('_ctl0_btnLogOn').click();
						});
					}, 5*1000);
				},
				function() {
					console.log('Lets get balance!');
					setTimeout(function() {
						page.evaluate(function() {
							return document.getElementsByTagName('html')[0].innerHTML;
						}, function(html) {
							// cheerio でパースしてユーザ名とポイントを取得
							var $ = cheerio.load(html);
							var balance = $('a#_ctl0_lnkRealMoneyAccount').text();
							balance = Number(balance.substr(1));
							console.log('balance = ' + balance);

							if (frontObj.balance != balance) { // 変更のないときは更新しない。
								frontObj.beforeBalance = frontObj.balance;
								frontObj.balance = balance;
								frontObj.difference = Math.floor((balance - frontObj.beforeBalance)*100)/100;
								if (frontObj.difference < 0) {
									frontObj.difference = '-$' + frontObj.difference;
								} else {
									frontObj.difference = '+$' + frontObj.difference;
								}
								frontObj.totalDifference = Math.floor((balance - frontObj.deposit)*100)/100;
								if (frontObj.totalDifference < 0) {
									frontObj.totalDifference = '-$' + frontObj.totalDifference;
								} else {
									frontObj.totalDifference = '+$' + frontObj.totalDifference;
								}
								frontObj.text = '$'+frontObj.balance+'('+frontObj.difference+') total: '+frontObj.totalDifference;
							}

							// お忘れなきよう (-人-)
							config.exitFlag = false;
							ph.exit();
						});
					}, 2*1000);
				}
			]).next();

		});
	});
}

try{
	getBalance();
} catch(e){
	getBalance();
}
setInterval(function() {
	try{
		getBalance();
	} catch(e){
		getBalance();
	}
}, 3*60*1000);


function sendResponseToFront(req, res) {
	var query = URL.parse(req.url, true).query;
	var data = JSON.stringify(frontObj);
	var callback;
	for (var key in query) {
		var val = query[key];
		if (key === 'callback' && /^[a-zA-Z]+[0-9a-zA-Z]*$/.test(val) ) {
			callback = val;
		}
	}
	res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'});
	res.end( callback ? callback + "(" + data + ");" : data );
}
