package com.mian.backend.persistence;

import jakarta.persistence.*;

/** Internal persistence entity. Never returned by a controller. */
@Entity
@Table(name="echo_rooms")
public class RoomSnapshot {
    @Id @Column(length=12,nullable=false) private String code;
    @Lob @Column(name="state_json",columnDefinition="LONGTEXT",nullable=false) private String stateJson;
    protected RoomSnapshot() { }
    public RoomSnapshot(String code,String stateJson){this.code=code;this.stateJson=stateJson;}
    public String getCode(){return code;}
    public String getStateJson(){return stateJson;}
}
