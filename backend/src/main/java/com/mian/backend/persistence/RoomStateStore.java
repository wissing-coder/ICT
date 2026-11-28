package com.mian.backend.persistence;

import java.util.List;

public interface RoomStateStore {
    List<String> loadAll();
    void save(String code,String stateJson);
    void delete(String code);
}
