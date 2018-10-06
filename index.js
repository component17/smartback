const devices = require('./devices');
const request = require('request');

const requestHandler = (request, response) => {
    console.log(request.method, request.url);

    response.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});

    switch (request.url) {
        case '/siri/all/on':
            fns.onAll();
            response.end('Свет включен');
            break;

        case '/siri/all/off':
            fns.offAll();
            response.end('Свет выключен');
            break;
        default:
            response.end('Неизвестная команда');
    }
};

const serverRest = require('http').createServer(requestHandler);

const serverWs = require('http').createServer();

//serverData();

let indicators = {};

for (let i in devices) {
    indicators[devices[i].namespace] = {
        index: i,
        title: devices[i].name,
        value: devices[i].default
    };
}

let data = {
    actions: [
        {
            namespace: 'onKitchen',
            textUp: 'Кухня 2/3',
            textDown: 'вкл/выкл',
            icon: 'on_off.svg',
            cell: 1
        },
        {
            namespace: 'onBoss',
            textUp: 'Кухня 1/3',
            textDown: 'вкл/выкл',
            icon: 'on_off.svg',
            cell: 0
        },
        {
            namespace: 'onAll',
            textUp: 'Весь свет',
            textDown: 'вкл',
            icon: 'on_off.svg',
            cell: 4
        },
        {
            namespace: 'offAll',
            textUp: 'Весь свет',
            textDown: 'выкл',
            icon: 'on_off.svg',
            cell: 9
        },
        {
            namespace: 'onLineOne',
            textUp: 'Линия 1',
            textDown: 'вкл/выкл',
            icon: 'on_off.svg',
            cell: 5
        },
        {
            namespace: 'flashLineOne',
            textUp: 'Линия 1',
            textDown: 'Помигать',
            icon: 'flash.svg',
            cell: 10
        },
        {
            namespace: 'onLineTwo',
            textUp: 'Линия 2',
            textDown: 'вкл/выкл',
            icon: 'on_off.svg',
            cell: 6
        },
        {
            namespace: 'flashLineTwo',
            textUp: 'Линия 2',
            textDown: 'Помигать',
            icon: 'flash.svg',
            cell: 11
        },
        {
            namespace: 'disco',
            textUp: 'Диско',
            textDown: 'вкл/выкл',
            icon: 'disco.svg',
            cell: 14
        }
    ],
    devices,
    widgets: {
        serverUPoint: {
            title: 'Сервер UPoint',
            icon: 'server.svg',
            value: 'ДОСТУПЕН',
            type: 'success'
        },
        balanceJelastic: {
            title: 'Баланс Jelastic',
            icon: 'balance.svg',
            value: '1 546.00',
            type: 'success'
        },
        usersUPointCount: {
            title: 'Пользователи UPoint',
            icon: 'users.svg',
            value: '30',
            type: 'default'
        },
        usersUPointOnLine: {
            title: 'Пользователи ONLINE',
            icon: 'online.svg',
            value: '12',
            type: 'success'
        },
    },
    info: {
        atmosphere: {
            temp: 24,
            humidity: 70
        },
        rate: {
            dollar: 54.78,
            euro: 60.47
        }
    },
    indicators
};

const io = require('socket.io')(serverWs, {
    path: '/',
    serveClient: false,
    pingInterval: 10000,
    pingTimeout: 5000,
    cookie: false
});

let actuator = null;
let actuatorStatus = false;

io.on('connection', (socket) => {

    console.log('CONNECTION', socket.id, socket.handshake.query);

    if (socket.handshake.query.token !== '27122712') {
        socket.disconnect(true);
    }

    if (socket.handshake.query.device === 'actuator') {
        actuator = socket;
        initActuator()
    } else {
        initClient(socket)
    }

    socket.on('disconnecting', (reason) => {

        console.log('DISCONNECT', socket.id, reason);

    });

    socket.on('actions', (key) => {
        console.log('actions', key);
        fns[key]();
    })

    socket.on('updateGPIO', ({namespace, val}) => {
        console.log(999, namespace, val)
        updateIndicators(namespace, val);
    })

});


// Инициализация исполнительного устройства
function initActuator() {
    actuator.emit('initActuator', data.devices);

    actuator.once('actuatorReady', () => {
        actuatorStatus = true;

        let now = new Date();
        let date = now.toLocaleDateString();
        sendMessage({
            date,
            source: 'Smart office',
            text: 'Исполнительное утсройство подключено',
            type: 'success'
        });

        io.sockets.emit('actuatorStatus', true);

        actuator.on('updateStatusGPIO', ({namespace, val}) => {
            updateIndicators(namespace, val);
        })
    });

    actuator.on('disconnecting', (reason) => {
        let now = new Date();
        let date = now.toLocaleDateString();
        sendMessage({
            date,
            source: 'Smart office',
            text: 'Исполнительное утсройство отключено!!! (' + reason + ')',
            type: 'error'
        });

        io.sockets.emit('actuatorStatus', false);
    });
}


// Инициализация клиента
function initClient(socket) {
    socket.emit('clientInit', data);
}

function updateIndicators(key, val) {
    data.indicators[key].value = val;
    io.sockets.emit('updateIndicators', data.indicators);
}

function updateWidgets(key, val) {
    data.widgets[key].value = val;
    io.sockets.emit('updateWidgets', data.widgets);
}

function setGPIO(key, val = undefined) {
    let value = !data.indicators[key].value;
    if (val !== undefined) {
        value = val;
    }

    actuator.emit('setGPIO', {namespace: key, value});
}

// Отправка сообщения
function sendMessage(data) {
    io.sockets.emit('message', data);
}

const fns = {
    onKitchen() {
        setGPIO('kitchen');
    },

    onBoss() {
        setGPIO('boss')
    },

    onAll() {
        setGPIO('lineOne', false);
        setGPIO('lineTwo', false);
        setGPIO('kitchen', false);
        setGPIO('boss', false);
    },

    offAll() {
        setGPIO('lineOne', true);
        setGPIO('lineTwo', true);
        setGPIO('kitchen', true);
        setGPIO('boss', true);
    },

    onLineOne() {
        setGPIO('lineOne');
    },

    async flashLineOne() {
        setGPIO('lineOne');
        await timeout(100);
        setGPIO('lineOne');
        await timeout(100);
        setGPIO('lineOne');
        await timeout(100);
        setGPIO('lineOne');
        await timeout(100);
        setGPIO('lineOne');
        await timeout(100);
        setGPIO('lineOne');
    },

    onLineTwo() {
        setGPIO('lineTwo');
    },

    async flashLineTwo() {
        setGPIO('lineTwo');
        await timeout(100);
        setGPIO('lineTwo');
        await timeout(100);
        setGPIO('lineTwo');
        await timeout(100);
        setGPIO('lineTwo');
        await timeout(100);
        setGPIO('lineTwo');
        await timeout(100);
        setGPIO('lineTwo');
    },

    disco() {
        setGPIO('lineTwo');
    }
};

function timeout(ms) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, ms)
    })
}

function serverData() {
    serverRequest();
    setInterval(() => {
        serverRequest()
    }, 1000 * 60 * 60)
}

function serverRequest() {
    request('http://upoint-rest.jelastic.regruhosting.ru/api/jelastic/youisaliv', (error, response, body) => {
        console.log(body)

    })
}

serverWs.listen(8080);
serverRest.listen(8085);