package com.mian.backend;

import com.mian.backend.persistence.RoomSnapshot;
import com.mian.backend.persistence.RoomSnapshotRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.ActiveProfiles;
import javax.sql.DataSource;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in: exclusively use an isolated integration database and Redis instance. */
@SpringBootTest
@ActiveProfiles("integration")
@EnabledIfEnvironmentVariable(named="ECHO_INFRA_INTEGRATION",matches="yes")
class InfrastructureIntegrationTest {
    @Autowired DataSource dataSource;
    @Autowired StringRedisTemplate redis;
    @Autowired RoomSnapshotRepository rooms;
    @Test void defaultBackendConnectsToMySqlAndRedis() throws Exception {
        try(var c=dataSource.getConnection()){assertEquals("MySQL",c.getMetaData().getDatabaseProductName());}
        try(var c=redis.getRequiredConnectionFactory().getConnection()){assertEquals("PONG",c.ping());}
    }
    @Test void jpaCommitsAndReadsSnapshotOnRealMySql(){
        String code=UUID.randomUUID().toString().substring(0,8).toUpperCase();
        String snapshot="{\"code\":\""+code+"\",\"mode\":\"friends\"}";
        try{rooms.saveAndFlush(new RoomSnapshot(code,snapshot));assertEquals(snapshot,rooms.findById(code).orElseThrow().getStateJson());}
        finally{rooms.deleteById(code);}
    }
}
