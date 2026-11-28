package com.mian.backend.game;

import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.test.context.ActiveProfiles;
import java.net.*;
import java.net.http.*;
import java.util.*;
import com.fasterxml.jackson.databind.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class BackendContractTest {
    @Value("${local.server.port}") int port;
    final HttpClient client=HttpClient.newHttpClient();
    final ObjectMapper json=new ObjectMapper();
    JsonNode request(String path,String body,String token) throws Exception {
        var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path));
        if(token!=null)b.header("Authorization","Bearer "+token);
        if(body!=null)b.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body));
        var response=client.send(b.build(),HttpResponse.BodyHandlers.ofString());assertEquals(200,response.statusCode());return json.readTree(response.body());
    }
    @Test void originalHealthContractIsUnchanged() throws Exception {
        var r=request("/api/health",null,null);assertEquals(0,r.path("code").asInt());assertEquals("success",r.path("msg").asText());assertEquals("UP",r.path("data").asText());
    }
    @Test void businessAndMalformedErrorsUseOriginalErrorCodes() throws Exception {
        var missing=request("/api/room/FFFFFFFF/state",null,"missing");assertEquals(2001,missing.path("code").asInt());assertTrue(missing.path("data").isNull());
        var malformed=request("/api/solo","{",null);assertEquals(1001,malformed.path("code").asInt());assertTrue(malformed.path("data").isNull());
        assertFalse(malformed.toString().contains("stackTrace"));
    }
    @Test void roomAndPrivateRoleUseWrappedDedicatedView() throws Exception {
        var created=request("/api/solo","{\"name\":\"角色契约\",\"role\":\"yu\",\"avatarId\":\"yu-2\"}",null);assertEquals(0,created.path("code").asInt());
        var data=created.path("data");String token=data.path("token").asText(),code=data.path("state").path("code").asText();
        var state=request("/api/room/"+code+"/state",null,token).path("data");assertTrue(state.path("serverTime").isNumber());assertTrue(state.path("phaseDeadline").isTextual());assertTrue(state.path("phaseDeadlineMs").isNumber());
        var role=request("/api/game/role",null,token).path("data");assertEquals("苏明玉",role.path("characterName").asText());assertEquals("yu-2",role.path("avatarId").asText());assertFalse(role.path("privateSecret").asText().isBlank());
        for(String field:List.of("groundTruth","leakKeywords","isMurderer","digest","state_json"))assertFalse(role.has(field));
    }
    @Test void teammateCannotReadAnotherRoomAndNpcRespectsStage() throws Exception {
        var a=request("/api/solo","{\"name\":\"甲\",\"role\":\"lin\"}",null).path("data");
        var b=request("/api/solo","{\"name\":\"乙\",\"role\":\"yu\"}",null).path("data");
        var cross=request("/api/room/"+a.path("state").path("code").asText()+"/state",null,b.path("token").asText());assertEquals(1002,cross.path("code").asInt());
        var npc=request("/api/game/ask-npc","{\"npcId\":1,\"question\":\"昨晚你在哪？\"}",a.path("token").asText());assertEquals(3001,npc.path("code").asInt());
        var unauth=request("/api/game/role",null,null);assertEquals(1002,unauth.path("code").asInt());
    }
}
