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
		RED.nodes.createNode(this, config);
        var node = this;
        var WebSocket = require('ws');
        var s4cUtility = require("./snap4city-utility.js");
        const logger = s4cUtility.getLogger(RED, node);
        const uid = s4cUtility.retrieveAppID(RED);
        
        logger.debug("Snap4D3Dashboard");
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
        node.metricType = "Series";        
        node.metricShortDesc = config.metricName;
        node.metricFullDesc = config.metricName;

        node.getD3Configuration = function(msg,config){
			
			logger.info("\n getD3Configuration");
            return msg.configuration && msg.configuration.trim().length!=0 ? msg.configuration : config.d3Configuration;
        }

        node.senDataToWidget = function(msg,timeout){
            logger.info("\n senDataToWidget");
            const d3Configuration = node.getD3Configuration(msg,config);
            

            logger.info("\n d3Configuration");
            logger.info(d3Configuration);
            logger.info("\n");

            const newMetricData = {
                msgType: "AddMetricData",
                nodeId: node.id,
                metricName: encodeURIComponent(node.metricName),
                metricType: node.metricType,
                newValue: {
                    d3Configuration: d3Configuration,
                    payload: msg.payload
                },
                appId: uid,
                user: node.username,
                flowId: node.z,
                flowName: node.flowName,
                accessToken: s4cUtility.retrieveAccessToken(RED, node, config.authentication, uid),
                
            };

            const metricDataAsJson = JSON.stringify(newMetricData);           
            
            logger.info(metricDataAsJson);
            setTimeout(function () {
                try {
                    logger.info("Sending inside timeout");
                    node.ws.send(metricDataAsJson);
                } catch (e) {
                    logger.error("Error sending data to WebSocket for Snap4D3 node " + node.name + ": " + e);
                }
            }, timeout);

            s4cUtility.eventLog(RED, msg, newMetricData, config, "Node-Red", "Dashboard", wsServer, "TX");
        }

        node.on('input', function (msg) {
            logger.info("Flow input received for Snap4D3 node " + node.name + ": " + JSON.stringify(msg));

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
                    logger.info("Why ws is null? I am in node.on('input'");
                }
                node.ws = new WebSocket(wsServer, {
                    origin: wsServerHttpOrigin
                });
                node.ws.on('error', node.wsErrorCallback);
                node.ws.on('open', node.wsOpenCallback);
                node.ws.on('message', node.wsMessageCallback);
                node.ws.on('close', node.wsCloseCallback);
                node.ws.on('pong', node.wsHeartbeatCallback);
                logger.info("Snap4D3 node " + node.name + " is reconnetting to open WebSocket");
                timeout = 1000;
            }
            node.wsStart = new Date().getTime();

            node.senDataToWidget(msg,timeout);

        });

        node.on('close', function (removed, closedDoneCallback) {
            if (removed) {
                // Cancellazione nodo
                logger.info("Snap4D3 node " + node.name + " is being removed from flow");

                node.deleteEmitter();
                node.deleteMetric();
            } else {
                // Riavvio nodo
                logger.info("Snap4D3 node " + node.name + " is being rebooted");
                node.notRestart = true;
                node.ws.terminate();
            }
            clearInterval(node.pingInterval);
            closedDoneCallback();
        });

        node.registerSnap4D3Node = function(){
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
                widgetTitle: node.widgetTitle,
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
                            logger.info("Errore on Ping " + e);
                        }
                    }
                }, 30000);
            }

            logger.info("Snap4D3 node " + node.name + " IS GOING TO CONNECT WS");
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

                node.registerSnap4D3Node();
                
            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "No dashboard selected"
                });
            }
        };

        node.sendDataToNextNode = function(data){
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

        node.parseJSONOrReturnNull = function(jsonData){
            try{
                return JSON.parse(jsonData);
            }catch(e){
                return null;
            }
        }

        node.wsMessageCallback = function (data) {
            const response = JSON.parse(data);
            logger.info(response);
            switch (response.msgType) {
            case "AddEmitter": case "AddEditMetric":
                if (response.result === "Ok") {
                    node.widgetUniqueName = response.widgetUniqueName;

                    logger.info("WebSocket server correctly added/edited emitter type or metric for Snap4D3 node " + node.name + ": " + response.result);
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
                    logger.info("WebSocket server could not add/edit emitter type or metric for Snap4D3 node " + node.name + ": " + response.result);
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
                    logger.info("WebSocket server correctly deleted emitter type or metric for Snap4D3 node " + node.name + ": " + response.result);
                } else {                    
                    logger.info("WebSocket server could not delete emitter type or metric for Snap4D3 node " + node.name + ": " + response.result);
                }
                logger.info("Closing webSocket server for Snap4D3 node " + node.name);
                node.notRestart = true;
                if(node.ws!=null){
                    node.ws.terminate();
                }
                break;                
            case "DataToEmitter":

                logger.info("[DATA TO EMITTER] "+data);                

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

                    const messageFromWidget = node.parseJSONOrReturnNull(response.newValue);
                    
                    if(messageFromWidget!=null &&  messageFromWidget.widgetOperation== "SendToSnap4D3"){ // received data from widget

                        outputMessage = node.sendDataToNextNode(messageFromWidget.widgetData);                       
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
                logger.info(response.msgType);
                break;
            }
        };

        node.wsCloseCallback = function (e) {
            logger.info("Snap4D3 node " + node.name + " closed WebSocket");
            logger.info("Snap4D3 closed reason " + e);
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
                logger.info("Why ws is null? I am in node.wsCloseCallback");
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

                logger.info("Snap4D3 node " + node.name + " will try to reconnect to WebSocket in " + reconnectionRetryTime + "s");
                if (!node.intervalID) {
                    node.intervalID = setInterval(node.wsInit, reconnectionRetryTime * 1000);
                }
            }
            node.notRestart = false;
        };

        node.wsErrorCallback = function (e) {
            logger.info("Snap4D3 node " + node.name + " got WebSocket error: " + e);
        };

        node.deleteEmitter = function () {
            logger.info("Deleting emitter via webSocket for Snap4D3 node " + node.name);
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
                logger.info("Error deleting emitter via webSocket for Snap4D3 node " + node.name + ": " + e);
            }
        };

        node.deleteMetric = function () {
            logger.info("Deleting metric via webSocket for Snap4D3 node " + node.name);
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
                logger.info("Error deleting metric via webSocket for Snap4D3 node " + node.name + ": " + e);
            }
        };

        node.wsHeartbeatCallback = function () {
            logger.silly("heartbeat callback");
        };



        //Lasciarlo, altrimenti va in timeout!!! https://nodered.org/docs/creating-nodes/node-js#closing-the-node
        node.closedDoneCallback = function () {
            logger.info("Snap4D3 node " + node.name + " has been closed");
        };

        node.wsInit = function (e) {
            logger.info("Snap4D3 node " + node.name + " is trying to open WebSocket");
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
                    logger.info("Snap4D3 node " + node.name + " already open WebSocket");
                }
            } catch (e) {
                logger.info("Snap4D3 node " + node.name + " could not open WebSocket");
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
			logger.info("\n senDataToWidget");
        } catch (e) {
            logger.info("Snap4D3 node " + node.name + " got main exception connecting to WebSocket");
        }

    }

    RED.nodes.registerType("Snap4D3", Snap4D3Dashboard);

    
};