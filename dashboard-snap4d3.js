/* NODE-RED-CONTRIB-SNAP4CITY-USER
   Copyright (C) 2018 DISIT Lab http://www.disit.org - University of Florence

   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU Affero General Public License as
   published by the Free Software Foundation, either version 3 of the
   License, or (at your option) any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU Affero General Public License for more details.

   You should have received a copy of the GNU Affero General Public License
   along with this program.  If not, see <http://www.gnu.org/licenses/>. */
module.exports = function (RED) {

    function Snap4D3Dashboard(config) {
        const WebSocket = require('ws');
        const util = require('util');
        const s4cUtility = require("./snap4city-utility.js");
        const uid = s4cUtility.retrieveAppID(RED);
        RED.nodes.createNode(this, config);
        const node = this;
        //const wsServer = (RED.settings.wsServerUrl ? RED.settings.wsServerUrl : "wss://dashboard.km4city.org:443/server");
        //const wsServerHttpOrigin = (RED.settings.wsServerHttpOrigin ? RED.settings.wsServerHttpOrigin : "https://www.snap4city.org");

        const wsServer = s4cUtility.settingUrl(RED,node, "wsServerUrl", "wss://www.snap4city.org", "/wsserver", true);
        const wsServerHttpOrigin = s4cUtility.settingUrl(RED,node, "wsServerHttpOrigin", "wss://www.snap4city.org", "", true);
        
        node.ws = null;
        node.notRestart = false;
        //Meccanismo di passaggio dei valori tra il menu di add/edit node e il codice del nodo
        node.name = "NR_" + node.id.replace(".", "_");
        node.widgetTitle = config.name;
        node.username = config.username;
        node.flowName = config.flowName;
        node.selectedDashboardId = config.selectedDashboardId;
        node.dashboardId = config.dashboardId;
        node.valueType = "String"; //config.valueType;
        node.startValue = 0;
        node.minValue = null;
        node.maxValue = null;
        node.offValue = null;
        node.onValue = null;
        node.domain = "singleNumericValue";
        node.httpRoot = null;

        node.metricName = "NR_" + node.id.replace(".", "_");
        node.metricType = config.metricType;        
        node.metricShortDesc = config.metricName;
        node.metricFullDesc = config.metricName;


        function senDataToWidget(msg,timeout){
            const newMetricData = {
                msgType: "AddMetricData",
                nodeId: node.id,
                metricName: encodeURIComponent(node.metricName),
                metricType: node.metricType,
                newValue: {
                    d3Configuration: config.d3Configuration,
                    payload:msg.payload
                },
                appId: uid,
                user: node.username,
                flowId: node.z,
                flowName: node.flowName,
                accessToken: s4cUtility.retrieveAccessToken(RED, node, config.authentication, uid),
                
            };

            const metricDataAsJson = JSON.stringify(newMetricData);           
            
            console.log(metricDataAsJson);
            setTimeout(function () {
                try {
                    node.ws.send(metricDataAsJson);
                } catch (e) {
                    util.log("Error sending data to WebSocket for Snap4D3 node " + node.name + ": " + e);
                }
            }, timeout);

            s4cUtility.eventLog(RED, msg, newMetricData, config, "Node-Red", "Dashboard", wsServer, "TX");
        }

        node.on('input', function (msg) {
            util.log("Flow input received for Snap4D3 node " + node.name + ": " + JSON.stringify(msg));

            let timeout = 0;
            if ((new Date().getTime() - node.wsStart) > parseInt(RED.settings.wsReconnectTimeout ? RED.settings.wsReconnectTimeout : 1200) * 1000) {
                if (node.ws != null) {
                    node.ws.removeListener('error', node.wsErrorCallback);
                    node.ws.removeListener('open', node.wsOpenCallback);
                    node.ws.removeListener('message', node.wsMessageCallback);
                    node.ws.removeListener('close', node.wsCloseCallback);
                    node.ws.removeListener('pong', node.wsHeartbeatCallback);
                    node.notRestart = true;
                    node.ws.terminate();
                    node.ws = null;
                } else {
                    util.log("Why ws is null? I am in node.on('input'");
                }
                node.ws = new WebSocket(wsServer, {
                    origin: wsServerHttpOrigin
                });
                node.ws.on('error', node.wsErrorCallback);
                node.ws.on('open', node.wsOpenCallback);
                node.ws.on('message', node.wsMessageCallback);
                node.ws.on('close', node.wsCloseCallback);
                node.ws.on('pong', node.wsHeartbeatCallback);
                util.log("Snap4D3 node " + node.name + " is reconnetting to open WebSocket");
                timeout = 1000;
            }
            node.wsStart = new Date().getTime();

            senDataToWidget(msg,timeout);

        });

        node.on('close', function (removed, closedDoneCallback) {
            if (removed) {
                // Cancellazione nodo
                util.log("Snap4D3 node " + node.name + " is being removed from flow");

                node.deleteEmitter();
                node.deleteMetric();
            } else {
                // Riavvio nodo
                util.log("Snap4D3 node " + node.name + " is being rebooted");
                node.notRestart = true;
                node.ws.terminate();
            }
            clearInterval(node.pingInterval);
            closedDoneCallback();
        });

        function registerSnap4D3Node(){
            const accessToken = s4cUtility.retrieveAccessToken(RED, node, config.authentication, uid);

            // register Snap4D3 node as emitter to receive data from widget
            const payloadEmitter = {
                msgType: "AddEmitter",
                name: node.name,
                valueType: node.valueType,
                user: node.username,
                startValue: node.startValue,
                domainType: node.domain,
                offValue: node.offValue,
                onValue: node.onValue,
                minValue: node.minValue,
                maxValue: node.maxValue,
                endPointPort: (RED.settings.externalPort ? RED.settings.externalPort : 1895),
                endPointHost: (RED.settings.dashInNodeBaseUrl ? RED.settings.dashInNodeBaseUrl : "'0.0.0.0'"),
                httpRoot: node.httpRoot,
                appId: uid,
                flowId: node.z,
                flowName: node.flowName,
                nodeId: node.id,
                widgetType: "widgetSnap4D3",
                widgetTitle: node.widgetTitle,
                dashboardTitle: "",
                dashboardId: node.dashboardId,
                accessToken: accessToken
            };

            // register Snap4D3 node as metric manager to send data to widget
            const payloadMetric = {
                msgType: "AddEditMetric",
                metricName: encodeURIComponent(node.metricName),
                metricType: node.metricType,
                nodeId: node.id,
                startValue: node.startValue,
                user: node.username,
                metricShortDesc: node.metricShortDesc,
                metricFullDesc: node.metricFullDesc,
                appId: uid,
                flowId: node.z,
                flowName: node.flowName,
                widgetType: "widgetSnap4D3",
                widgetTitle: node.name,
                dashboardTitle: '',
                dashboardId: node.dashboardId,
                httpRoot: node.httpRoot,
                accessToken: accessToken
            };  

            
            if (node.pingInterval == null) {
                node.pingInterval = setInterval(function () {                        
                    if (node.ws != null) {
                        try {
                            node.ws.ping(); // KEEP ALIVE LOGIC
                        } catch (e) {
                            util.log("Errore on Ping " + e);
                        }
                    }
                }, 30000);
            }

            util.log("Snap4D3 node " + node.name + " IS GOING TO CONNECT WS");
            if (payloadMetric.accessToken != "") {
                setTimeout(function () {
                    node.ws.send(JSON.stringify(payloadMetric));
                    node.ws.send(JSON.stringify(payloadEmitter));                        
                }, Math.random() * 2000);
            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "Authentication Problem"
                });
            }
        }

        node.wsOpenCallback = function () {
            if (node.dashboardId != null && node.dashboardId != "") {
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: "connected to " + wsServer
                });

                if (RED.settings.hasOwnProperty('httpRoot')) {
                    if (RED.settings.httpRoot !== '/') {
                        node.httpRoot = RED.settings.httpRoot;
                    } else {
                        node.httpRoot = null;
                    }
                }

                registerSnap4D3Node();
                
            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "No dashboard selected"
                });
            }
        };

        function sendDataToNextNode(data){
            node.status({
                fill: "green",
                shape: "dot",
                text: "received data from widget"
            });
            const message = {
                payload: data
            };

            node.send(message); // sends the data received from the widget to the next node 
            return message;
        }

        function parseJSONOrReturnNull(jsonData){
            try{
                return JSON.parse(jsonData);
            }catch(e){
                return null;
            }
        }

        node.wsMessageCallback = function (data) {
            const response = JSON.parse(data);
            util.log(response);
            switch (response.msgType) {
            case "AddEmitter": case "AddEditMetric":
                if (response.result === "Ok") {
                    node.widgetUniqueName = response.widgetUniqueName;

                    util.log("WebSocket server correctly added/edited emitter type or metric for Snap4D3 node " + node.name + ": " + response.result);
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: "Created on dashboard"
                    });
                    if (node.intervalID != null) {
                        clearInterval(node.intervalID);
                        node.intervalID = null;
                    }
                } else {                    
                    util.log("WebSocket server could not add/edit emitter type or metric for Snap4D3 node " + node.name + ": " + response.result);
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: response.error
                    });
                    node.error(response.error);
                }
                break;

            case "DelEmitter": case "DelMetric":
                if (response.result === "Ok") {
                    util.log("WebSocket server correctly deleted emitter type or metric for Snap4D3 node " + node.name + ": " + response.result);
                } else {                    
                    util.log("WebSocket server could not delete emitter type or metric for Snap4D3 node " + node.name + ": " + response.result);
                }
                util.log("Closing webSocket server for Snap4D3 node " + node.name);
                node.notRestart = true;
                if(node.ws!=null){
                    node.ws.terminate();
                }
                break;                
            case "DataToEmitter":

                util.log("[DATA TO EMITTER] "+data);                

                if(response.newValue == "dashboardDeleted"){
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Dashboard deleted"
                    });
                }else{
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: "connected to " + wsServer
                    });
                   
                    let outputMessage = {};

                    const messageFromWidget = parseJSONOrReturnNull(response.newValue);
                    
                    if(messageFromWidget!=null &&  messageFromWidget.widgetOperation== "SendToSnap4D3"){ // received data from widget

                        outputMessage = sendDataToNextNode(messageFromWidget.widgetData);                       
                    }                    

                    node.ws.send(JSON.stringify({
                        msgType: "DataToEmitterAck",
                        widgetUniqueName: node.widgetUniqueName,
                        result: "Ok",
                        msgId: response.msgId,
                        accessToken: s4cUtility.retrieveAccessToken(RED, node, config.authentication, uid)
                    }));
                    s4cUtility.eventLog(RED, response, outputMessage, config, "Node-Red", "Dashboard", RED.settings.httpRoot + node.name, "RX"); 
                }

                
                break;
            default:
                util.log(response.msgType);
                break;
            }
        };

        node.wsCloseCallback = function (e) {
            util.log("Snap4D3 node " + node.name + " closed WebSocket");
            util.log("Snap4D3 closed reason " + e);
            if (!(node.dashboardId != null && node.dashboardId != "")) {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "No dashboard selected"
                });
            } else {
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "lost connection from " + wsServer
                });
            }

            if (node.ws != null) {
                node.ws.removeListener('error', node.wsErrorCallback);
                node.ws.removeListener('open', node.wsOpenCallback);
                node.ws.removeListener('message', node.wsMessageCallback);
                node.ws.removeListener('close', node.wsCloseCallback);
                node.ws.removeListener('pong', node.wsHeartbeatCallback);
                node.ws = null;
            } else {
                util.log("Why ws is null? I am in node.wsCloseCallback");
            }

            const wsServerRetryActive = (RED.settings.wsServerRetryActive ? RED.settings.wsServerRetryActive : "yes");
            const wsServerRetryTime = (RED.settings.wsServerRetryTime ? RED.settings.wsServerRetryTime : 30);
            
            if (wsServerRetryActive === 'yes' && !node.notRestart) {

                const reconnectionRetryTime = parseInt(wsServerRetryTime);

                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "lost connection from " + wsServer + " will try to reconnect in " + reconnectionRetryTime + "s"
                });

                util.log("Snap4D3 node " + node.name + " will try to reconnect to WebSocket in " + reconnectionRetryTime + "s");
                if (!node.intervalID) {
                    node.intervalID = setInterval(node.wsInit, reconnectionRetryTime * 1000);
                }
            }
            node.notRestart = false;
        };

        node.wsErrorCallback = function (e) {
            util.log("Snap4D3 node " + node.name + " got WebSocket error: " + e);
        };

        node.deleteEmitter = function () {
            util.log("Deleting emitter via webSocket for Snap4D3 node " + node.name);
            const newMsg = {
                msgType: "DelEmitter",
                nodeId: node.id,
                user: node.username,
                appId: uid,
                flowId: node.z,
                flowName: node.flowName,
                accessToken: s4cUtility.retrieveAccessToken(RED, node, config.authentication, uid)
            };

            try {
                node.ws.send(JSON.stringify(newMsg));
            } catch (e) {
                util.log("Error deleting emitter via webSocket for Snap4D3 node " + node.name + ": " + e);
            }
        };

        node.deleteMetric = function () {
            util.log("Deleting metric via webSocket for Snap4D3 node " + node.name);
            const newMsg = {
                msgType: "DelMetric",
                nodeId: node.id,
                metricName: encodeURIComponent(node.metricName),
                metricType: node.metricType,
                user: node.username,
                appId: uid,
                flowId: node.z,
                flowName: node.flowName,
                accessToken: s4cUtility.retrieveAccessToken(RED, node, config.authentication, uid)
            };

            try {
                node.ws.send(JSON.stringify(newMsg));
            } catch (e) {
                util.log("Error deleting metric via webSocket for Snap4D3 node " + node.name + ": " + e);
            }
        };

        node.wsHeartbeatCallback = function () {
            if (node.ws != null) {
                try {
                    node.ws.ping();
                } catch (e) {
                    util.log("Errore on Ping " + e);
                }
            }
        };



        //Lasciarlo, altrimenti va in timeout!!! https://nodered.org/docs/creating-nodes/node-js#closing-the-node
        node.closedDoneCallback = function () {
            util.log("Snap4D3 node " + node.name + " has been closed");
        };

        node.wsInit = function (e) {
            util.log("Snap4D3 node " + node.name + " is trying to open WebSocket");
            try {
                node.status({
                    fill: "yellow",
                    shape: "dot",
                    text: "connecting to " + wsServer
                });
                if (node.ws == null) {
                    node.ws = new WebSocket(wsServer, {
                        origin: wsServerHttpOrigin
                    });
                    node.ws.on('error', node.wsErrorCallback);
                    node.ws.on('open', node.wsOpenCallback);
                    node.ws.on('message', node.wsMessageCallback);
                    node.ws.on('close', node.wsCloseCallback);
                    node.ws.on('pong', node.wsHeartbeatCallback);
                    node.wsStart = new Date().getTime();
                } else {
                    util.log("Snap4D3 node " + node.name + " already open WebSocket");
                }
            } catch (e) {
                util.log("Snap4D3 node " + node.name + " could not open WebSocket");
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "unable to connect to " + wsServer
                });
                node.wsCloseCallback();
            }
        };

        //Inizio del "main"
        try {
            node.wsInit();
        } catch (e) {
            util.log("Snap4D3 node " + node.name + " got main exception connecting to WebSocket");
        }

    }

    RED.nodes.registerType("Snap4D3", Snap4D3Dashboard);

    RED.httpAdmin.get('/dashboardManagerBaseUrl', function (req, res) {
        const dashboardManagerBaseUrl = (RED.settings.dashboardManagerBaseUrl ? RED.settings.dashboardManagerBaseUrl : "https://main.snap4city.org");
        const dashboardSecret = (RED.settings.dashboardSecret ? RED.settings.dashboardSecret : "45awwprty_zzq34");
        res.send({
            "dashboardManagerBaseUrl": dashboardManagerBaseUrl,
            "dashboardSecret": dashboardSecret
        });
    });

    RED.httpAdmin.get('/dashboardList', RED.auth.needsPermission('impulse-button.read'), function (req, res) {
        const s4cUtility = require("./snap4city-utility.js");
        const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
        const xmlHttp = new XMLHttpRequest();
        const xmlHttp2 = new XMLHttpRequest();
        const dashboardManagerBaseUrl = (RED.settings.dashboardManagerBaseUrl ? RED.settings.dashboardManagerBaseUrl : "https://main.snap4city.org");
        const dashboardSecret = (RED.settings.dashboardSecret ? RED.settings.dashboardSecret : "45awwprty_zzq34");
        const accessToken = s4cUtility.retrieveAccessToken(RED, null, null, null);
        const uid = s4cUtility.retrieveAppID(RED);
        let username = "";
        const url = (RED.settings.ownershipUrl ? RED.settings.ownershipUrl : "https://www.snap4city.org/ownership-api/");
        xmlHttp.open("GET", encodeURI(url + "v1/list/?elementId=" + uid + "&elementType=AppId&accessToken=" + accessToken), true); 
        xmlHttp.onload = function (e) {
            if (xmlHttp.readyState === 4) {
                if (xmlHttp.status === 200) {
                    if (xmlHttp.responseText != "") {
                        try {
                            username = JSON.parse(xmlHttp.responseText)[0].username;
                        } catch (e) {
                            username = "";
                        }
                    }
                    if (username != "" && uid != "" && accessToken != "" && dashboardSecret != "" && dashboardManagerBaseUrl != "") {
                        xmlHttp2.open("GET", encodeURI(dashboardManagerBaseUrl + "/api/nodeRedDashboardsApi.php?v3&secret=" + dashboardSecret + "&username=" + username + "&accessToken=" + accessToken), true); 
                        xmlHttp2.onload = function (e) {
                            if (xmlHttp2.readyState === 4) {
                                if (xmlHttp2.status === 200) {
                                    if (xmlHttp2.responseText != "") {
                                        try {
                                            const response = JSON.parse(xmlHttp2.responseText);
                                            res.send({
                                                "dashboardList": response,
                                                "username": username
                                            });
                                        } catch (e) {
                                            res.send("");
                                        }
                                    }
                                } else {
                                    console.error(xmlHttp2.statusText);
                                }
                            }
                        };
                        xmlHttp2.onerror = function (e) {
                            console.error(xmlHttp2.statusText);
                        };
                        xmlHttp2.send(null);
                    }

                } else {
                    console.error(xmlHttp.statusText);
                }
            }
        };
        xmlHttp.onerror = function (e) {
            console.error(xmlHttp.statusText);
        };
        xmlHttp.send(null);
    });

    RED.httpAdmin.post('/createDashboard', RED.auth.needsPermission('impulse-button.read'), function (req, res) {
        const s4cUtility = require("./snap4city-utility.js");
        const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
        const xmlHttp = new XMLHttpRequest();
        const dashboardManagerBaseUrl = (RED.settings.dashboardManagerBaseUrl ? RED.settings.dashboardManagerBaseUrl : "https://main.snap4city.org");
        const accessToken = s4cUtility.retrieveAccessToken(RED, null, null, null);
        const uid = s4cUtility.retrieveAppID(RED);
        console.log(encodeURI(dashboardManagerBaseUrl + "/controllers/createDashboardFromNR.php?dashboardTitle=" + req.body.dashboardTitle));
        xmlHttp.open("GET", encodeURI(dashboardManagerBaseUrl + "/controllers/createDashboardFromNR.php?dashboardTitle=" + req.body.dashboardTitle + "&accessToken=" + accessToken), true); 
        xmlHttp.onload = function (e) {
            console.log(xmlHttp.responseText);
            res.send(xmlHttp.responseText);
        };
        xmlHttp.onerror = function (e) {
            console.error(xmlHttp.statusText);
        };
        xmlHttp.send(null);
    });

};