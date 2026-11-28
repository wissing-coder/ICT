package com.mian.backend.persistence;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Repository
@Transactional
public class JpaRoomStateStore implements RoomStateStore {
    private final RoomSnapshotRepository repository;
    public JpaRoomStateStore(RoomSnapshotRepository repository){this.repository=repository;}
    @Override @Transactional(readOnly=true) public List<String> loadAll(){return repository.findAll().stream().map(RoomSnapshot::getStateJson).toList();}
    @Override public void save(String code,String stateJson){repository.saveAndFlush(new RoomSnapshot(code,stateJson));}
    @Override public void delete(String code){repository.deleteById(code);}
}
